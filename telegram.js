'use strict';

/*
 * Telegram Bot API sender: posts a text to the configured chats (config
 * `telegram`), used by the Alice dialog skill (routes/alice.js).
 */

const debug = require('debug')('telegram');
const {matches, format, checkTemplate} = require('./targets');

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
        for (const t of this.targets) checkTemplate(`Telegram: chat ${t.chatId}`, t.template);
    }

    get enabled() {
        return Boolean(this.config.token) && this.targets.length > 0;
    }

    /* Targets of the y2m user and the device (targets.js: matches) */
    targetsFor(userId, device) {
        if (!this.config.token) return [];
        return this.targets.filter(t => matches(t, userId, device));
    }

    /**
     * Send `text` (formatted by the target template, %s: text, %d: device)
     * to every target of the user and device. Never throws: errors are
     * logged, the result is the number of delivered messages.
     */
    async send(text, userId, device) {
        const targets = this.targetsFor(userId, device);
        const results = await Promise.all(targets.map(t => this.sendOne(t, format(t.template, text, device))));
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
