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

module.exports.find = (key, done) => {
    const ltoken = global.authl.findOne({'token': key});
    if (ltoken) {
        const {userId, clientId} = ltoken;
        return done(null, {userId, clientId})
    } else {
        logger.log('error', new Error('Token Not Found'));
        return done();
    }
};

module.exports.findByUserIdAndClientId = (userId, clientId, done) => {
    // One token per user and client: a user linked to several skills
    // (smart home + dialog) with different clients keeps all of them
    const ltoken = global.authl.findOne({userId, clientId});
    if (ltoken) {
        logger.log('info', {message: `Load token by userId (${userId}), clientId (${clientId}): found`});
        return done(null, ltoken.token);
    }
    logger.log('error', new Error(`Token Not Found: userId (${userId}), clientId (${clientId})`));
    return done();
};

module.exports.save = (token, userId, clientId, done) => {
    logger.log('info', {message: `Start saving token`});
    const ltoken = global.authl.findOne({userId, clientId});
    if (ltoken) {
        logger.log('info', {message: `Token of user ${userId}, client ${clientId} updated`});
        global.authl.update(Object.assign({}, ltoken, {token, userId, clientId}));
    } else {
        logger.log('info', {message: `New token of user ${userId}, client ${clientId}`});
        global.authl.insert({'type': 'token', token, userId, clientId});
    }
    done();
};

/* works */
