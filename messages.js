'use strict';

/*
 * Alice phrase -> all message targets: Telegram chats (telegram.js), then
 * OpenClaw agents (openclaw.js). Telegram first: the phrase appears in the
 * chat before the agent's answer.
 */

const Telegram = require('./telegram');
const OpenClaw = require('./openclaw');

class Messages {
    constructor(config) {
        this.telegram = new Telegram(config.telegram);
        this.openclaw = new OpenClaw(config.openclaw);
    }

    get enabled() {
        return this.telegram.enabled || this.openclaw.enabled;
    }

    /* Number of delivered / accepted messages, never throws */
    async send(text, userId, device) {
        const total = this.telegram.targetsFor(userId, device).length
            + this.openclaw.targetsFor(userId, device).length;
        if (total === 0) {
            global.logger.error(`Messages: no targets for user ${userId}, device '${(device && device.name) || ''}', message dropped`);
            return 0;
        }
        const telegram = await this.telegram.send(text, userId, device);
        const openclaw = await this.openclaw.send(text, userId, device);
        return telegram + openclaw;
    }
}

module.exports = Messages;
