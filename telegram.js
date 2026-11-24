'use strict';

/*
 * Telegram Bot API sender: posts a text to the configured chats (config
 * `telegram`), used by the Alice dialog skill (routes/alice.js).
 */

const debug = require('debug')('telegram');

const API_URL = 'https://api.telegram.org';

class Telegram {
    /**
     * @param {Object} config `telegram` block of the config:
     *   token:   bot token (required to send anything)
     *   apiUrl:  Bot API URL, default https://api.telegram.org
     *   targets: [{chatId, threadId, template, silent, users, devices}]
     */
    constructor(config) {
        this.config = config || {};
        this.targets = this.config.targets || [];
        for (const t of this.targets) {
            if (t.template !== undefined && String(t.template).indexOf('%s') === -1) {
                global.logger.error(`Telegram: chat ${t.chatId}: template without %s, the phrase is not sent`);
            }
        }
    }

    get enabled() {
        return Boolean(this.config.token) && this.targets.length > 0;
    }

    /**
     * Targets of the y2m user and the device: `users` (y2m user ids) and
     * `devices` (device names or application_ids) not set: any.
     */
    targetsFor(userId, device) {
        const dev = device || {};
        return this.targets.filter(t =>
            (!Array.isArray(t.users) || t.users.indexOf(userId) > -1)
            && (!Array.isArray(t.devices) || t.devices.indexOf(dev.name) > -1 || t.devices.indexOf(dev.id) > -1));
    }

    /**
     * Message for the target: its `template` with `%s` replaced by the text
     * and `%d` by the device name (default '%s': the text as is).
     */
    static format(target, text, device) {
        const template = target.template === undefined ? '%s' : String(target.template);
        const name = (device && device.name) || '';
        // One pass, function replacement: no substitution inside the text,
        // no special `$` patterns
        return template.replace(/%[sd]/g, m => (m === '%s' ? text : name));
    }

    /**
     * Send `text` (formatted by the target template) to every target of the user. Never throws:
     * errors are logged, the result is the number of delivered messages.
     */
    async send(text, userId, device) {
        const targets = this.targetsFor(userId, device);
        if (!this.config.token || targets.length === 0) {
            global.logger.error(`Telegram: no targets for user ${userId}, device '${(device && device.name) || ''}', message dropped`);
            return 0;
        }

        const results = await Promise.all(targets.map(t => this.sendOne(t, Telegram.format(t, text, device))));
        return results.filter(Boolean).length;
    }

    async sendOne(target, text) {
        const url = `${this.config.apiUrl || API_URL}/bot${this.config.token}/sendMessage`;
        const body = {
            chat_id: target.chatId,
            text,
        };
        if (target.threadId !== undefined) body.message_thread_id = target.threadId;
        if (target.silent) body.disable_notification = true;

        debug('sendMessage: %o', body);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10000),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                // Never log the URL: it contains the bot token
                global.logger.error(`Telegram: chat ${target.chatId}: HTTP ${res.status} ${data.description || ''}`);
                return false;
            }
            global.logger.info(`Telegram: sent to chat ${target.chatId}`);
            return true;
        } catch (e) {
            global.logger.error(`Telegram: chat ${target.chatId}: ${e.name}: ${e.message}`);
            return false;
        }
    }
}

module.exports = Telegram;
