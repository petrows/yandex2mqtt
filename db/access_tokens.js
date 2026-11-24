'use strict';

const {logger} = global;
const { cli } = global;
const loki = require('lokijs');

global.dbl = new loki(cli.db, {
    autoload: true,
    autosave: true,
    autosaveInterval: 5000,
    autoloadCallback() {
        global.authl = global.dbl.getCollection('tokens');
        if (global.authl === null) {
            global.authl = global.dbl.addCollection('tokens');
        }
    }
});

// Tokens kept per user + client: every linking (account linking of a skill)
// issues its own token and they don't replace each other - one OAuth client
// is often shared by several skills (smart home + dialog), each keeps using
// its token. Tokens don't expire; unlink removes its token (routes/user.js),
// the oldest ones above this limit are dropped (relinking again and again).
const MAX_TOKENS_PER_CLIENT = 20;

module.exports.find = (key, done) => {
    const ltoken = global.authl.findOne({'token': key});
    if (ltoken) {
        const {userId, clientId} = ltoken;
        return done(null, {userId, clientId})
    }
    // Unknown token: never linked here, or replaced / removed (unlink)
    logger.warn('Token not found (unknown or removed token: relink the skill in the Yandex app)');
    return done();
};

/* Any token of the user and client (auto-approve of a known client) */
module.exports.findByUserIdAndClientId = (userId, clientId, done) => {
    const ltoken = global.authl.findOne({userId, clientId});
    if (ltoken) {
        logger.log('info', {message: `Load token by userId (${userId}), clientId (${clientId}): found`});
        return done(null, ltoken.token);
    }
    logger.log('info', {message: `No token of userId (${userId}), clientId (${clientId}) yet`});
    return done();
};

module.exports.save = (token, userId, clientId, done) => {
    global.authl.insert({'type': 'token', token, userId, clientId});
    const tokens = global.authl.chain()
        .find({userId, clientId})
        .simplesort('$loki', true)
        .data();
    for (const old of tokens.slice(MAX_TOKENS_PER_CLIENT)) {
        global.authl.remove(old);
    }
    logger.log('info', {message: `New token of user ${userId}, client ${clientId} (${Math.min(tokens.length, MAX_TOKENS_PER_CLIENT)} tokens)`});
    done();
};
