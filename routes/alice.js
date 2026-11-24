'use strict';

/*
 * Alice dialog skill ("Навык в Алисе") webhook: forwards the user's phrase to
 * Telegram chats (config `telegram`) and OpenClaw agents (config `openclaw`),
 * see messages.js.
 *
 * The skill uses account linking with the OAuth server of this app
 * (/dialog/authorize, /oauth/token): the y2m user is found by the access
 * token, tokens are stored in the db without expiry - linked once, works
 * forever (until unlinked in the Yandex app).
 *
 * Yandex docs: https://yandex.ru/dev/dialogs/alice/doc/ru/request ,
 * https://yandex.ru/dev/dialogs/alice/doc/ru/auth/how-it-works
 */

const debug = require('debug')('route:alice');
const db = require('../db');

const DEFAULTS = {
    // Allowed skill ids (session.skill_id), empty: any skill
    skillIds: [],
    // Alice replies
    replySent: 'Отправила.',
    replySending: 'Отправляю.',
    replyFailed: 'Не получилось отправить сообщение.',
    replyAsk: 'Что передать?',
    replyLogin: 'Чтобы отправлять сообщения, войдите в аккаунт: откройте навык в приложении Яндекс.',
    // Optional phrase transform before sending: text => text (empty: nothing to send)
    transform: null,
    // Wait for the targets that long before answering "sending" (Alice waits ~3s)
    sendWaitMs: 2000,
    // Device names: session.application.application_id -> name (e.g. room),
    // used as %d in the Telegram templates. The ids are logged per message.
    devices: {},
    // Name of a device not in `devices`, by the client type (meta.client_id)
    deviceSpeaker: 'колонка',
    deviceApp: 'приложение',
};

/* Device the request came from: {id: application_id, name, client} */
function getDevice(body, opts) {
    const session = body.session || {};
    const meta = body.meta || {};
    const id = (session.application && session.application.application_id) || '';
    const client = meta.client_id || '';
    let name = id && opts.devices[id];
    if (!name) {
        // Smart speakers: ru.yandex.quasar..., the Yandex apps: ru.yandex.searchplugin, ...
        if (/quasar/i.test(client)) name = opts.deviceSpeaker;
        else if (client) name = opts.deviceApp;
        else name = id;
    }
    return {id, name, client};
}

// Phrase said before account linking, sent once linking completes
// (Yandex doesn't repeat it): application_id -> {text, device, ts}
const PENDING_TTL_MS = 10 * 60 * 1000;

function reply(body, text, endSession) {
    return {
        version: (body && body.version) || '1.0',
        response: {
            text,
            end_session: endSession,
        },
    };
}

function getToken(req) {
    const header = req.get('Authorization') || '';
    const m = header.match(/^Bearer\s+(\S+)$/i);
    if (m) return m[1];
    // Docs: also in the body, if the headers don't reach the skill
    const user = req.body && req.body.session && req.body.session.user;
    return user && user.access_token;
}

function findUser(token) {
    if (!token || !global.authl) return null;
    const record = global.authl.findOne({token});
    if (!record || !record.userId) return null;
    let found = null;
    db.users.findById(record.userId, (error, user) => {
        if (!error && user) found = user;
    });
    return found;
}

module.exports = (config, messages) => {
    const opts = Object.assign({}, DEFAULTS, config.alice || {});
    const pending = new Map();

    function cleanPending() {
        const now = Date.now();
        for (const [key, value] of pending) {
            if (now - value.ts > PENDING_TTL_MS) pending.delete(key);
        }
    }

    function prepare(utterance) {
        let text = (utterance || '').trim();
        if (text && typeof opts.transform === 'function') {
            text = (opts.transform(text) || '').trim();
        }
        return text;
    }

    // Send and answer with the result if the targets are fast enough, else
    // answer "sending" (the message is still sent in the background)
    async function sendAndReply(body, text, user, device) {
        global.logger.info(`Alice: message from user ${user.id}, device '${device.name}' (application_id ${device.id}, client ${device.client}): ${text}`);
        const sending = messages.send(text, user.id, device);
        const timeout = new Promise(resolve => setTimeout(() => resolve(null), opts.sendWaitMs));
        const sent = await Promise.race([sending, timeout]);
        if (sent === null) return reply(body, opts.replySending, true);
        return reply(body, sent > 0 ? opts.replySent : opts.replyFailed, true);
    }

    async function handle(body, req) {
        const session = body.session || {};
        const request = body.request || {};
        const appId = session.application && session.application.application_id;

        if (opts.skillIds.length > 0 && opts.skillIds.indexOf(session.skill_id) === -1) {
            global.logger.error(`Alice: unknown skill_id ${session.skill_id}`);
            return null;
        }

        // Health check
        if (request.original_utterance === 'ping') return reply(body, 'pong', true);

        const user = findUser(getToken(req));

        if (body.account_linking_complete_event !== undefined) {
            cleanPending();
            const saved = appId && pending.get(appId);
            if (appId) pending.delete(appId);
            if (!user) return reply(body, opts.replyLogin, true);
            global.logger.info(`Alice: account linked, user ${user.id}`);
            if (saved) return sendAndReply(body, saved.text, user, saved.device);
            return reply(body, opts.replyAsk, false);
        }

        const text = prepare(request.original_utterance);

        if (!user) {
            const interfaces = (body.meta && body.meta.interfaces) || {};
            // Linking card only where the surface supports it, else Alice
            // reports the skill as broken
            if (interfaces.account_linking === undefined) return reply(body, opts.replyLogin, true);
            if (appId && text) {
                cleanPending();
                pending.set(appId, {text, device: getDevice(body, opts), ts: Date.now()});
            }
            debug('start account linking, app %s', appId);
            // No `response` with start_account_linking (make-skill docs)
            return {
                version: body.version || '1.0',
                start_account_linking: {},
            };
        }

        // "Алиса, запусти навык ..." without a phrase: ask, keep the session
        if (!text) return reply(body, opts.replyAsk, false);

        return sendAndReply(body, text, user, getDevice(body, opts));
    }

    return {
        webhook: async (req, res) => {
            debug('recv: %O', req.body);
            try {
                const answer = await handle(req.body || {}, req);
                if (answer === null) return res.status(403).send();
                debug('send: %O', answer);
                return res.status(200).json(answer);
            } catch (e) {
                global.logger.error(e);
                return res.status(200).json(reply(req.body, opts.replyFailed, true));
            }
        },
    };
};
