'use strict';

/*
 * OpenClaw webhook sender (config `openclaw`): passes the phrase to an
 * OpenClaw agent via POST /hooks/agent, optionally into an existing session
 * (e.g. the session of a Telegram group: the agent answers there, with the
 * chat history). Telegram bots don't see messages of other bots, so a
 * message of the y2m Telegram bot never reaches an OpenClaw Telegram bot.
 *
 * https://docs.openclaw.ai/automation/cron-jobs/webhooks
 */

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const debug = require('debug')('openclaw');
const {matches, format, checkTemplate} = require('./targets');

const RETRIES = 1;
const TIMEOUT_MS = 10000;

function errorText(e) {
    return `${e.code || e.name}: ${e.message}`;
}

/**
 * POST with node http(s), not fetch: the TLS check can be disabled for
 * this request only (`tlsVerify: false`), fetch can't without undici.
 * Resolves {status, ok, text}, rejects on network errors / timeout.
 */
function post(url, headers, body, {tlsVerify = true, timeoutMs = TIMEOUT_MS} = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.request(u, {
            method: 'POST',
            headers: Object.assign({'Content-Length': Buffer.byteLength(body)}, headers),
            rejectUnauthorized: tlsVerify,
            timeout: timeoutMs,
        }, res => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', d => { text += d; });
            res.on('end', () => resolve({status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, text}));
            res.on('error', reject);
        });
        req.on('timeout', () => req.destroy(Object.assign(new Error(`no answer in ${timeoutMs} ms`), {code: 'ETIMEDOUT'})));
        req.on('error', reject);
        req.end(body);
    });
}

class OpenClaw {
    /**
     * @param {Object} config `openclaw` block of the config:
     *   targets: [{url, token, tlsVerify, agentId, sessionKey, channel, to,
     *              template, name, deliver, extra, users, devices}]
     */
    constructor(config) {
        this.config = config || {};
        this.targets = (this.config.targets || []).filter(t => {
            if (!t.url || !t.token) {
                global.logger.error(`OpenClaw: target ${t.url || '?'}: 'url' and 'token' are required, target ignored`);
                return false;
            }
            checkTemplate(`OpenClaw: ${t.url}`, t.template);
            if (t.tlsVerify === false) {
                global.logger.info(`OpenClaw: ${t.url}: TLS certificate check disabled (tlsVerify: false)`);
            }
            return true;
        });
    }

    get enabled() {
        return this.targets.length > 0;
    }

    targetsFor(userId, device) {
        return this.targets.filter(t => matches(t, userId, device));
    }

    /* Request body of /hooks/agent for the target */
    static body(target, text, device) {
        const body = {
            message: format(target.template, text, device),
            name: format(target.name, text, device, 'Алиса (%d)'),
        };
        if (target.agentId) body.agentId = target.agentId;
        if (target.sessionKey) {
            // Into an existing session (needs hooks.allowRequestSessionKey
            // and a matching hooks.allowedSessionKeyPrefixes in OpenClaw)
            body.sessionKey = target.sessionKey;
            body.sessionMode = 'persistent';
        }
        if (target.channel) body.channel = target.channel;
        if (target.to !== undefined) body.to = String(target.to);
        body.deliver = target.deliver === undefined ? true : Boolean(target.deliver);
        return Object.assign(body, target.extra || {});
    }

    /**
     * Send `text` to every target of the user and device. Never throws:
     * errors are logged, the result is the number of accepted requests.
     */
    async send(text, userId, device) {
        const targets = this.targetsFor(userId, device);
        const results = await Promise.all(targets.map(t => this.sendOne(t, OpenClaw.body(t, text, device))));
        return results.filter(Boolean).length;
    }

    async sendOne(target, body) {
        const what = `OpenClaw ${target.url} (agent ${body.agentId || 'default'})`;
        // Same key on a retry: OpenClaw runs the request once
        const idempotencyKey = crypto.randomUUID();
        debug('%s: %o', what, body);

        for (let attempt = 0; attempt <= RETRIES; attempt++) {
            try {
                const res = await post(target.url, {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${target.token}`,
                    'Idempotency-Key': idempotencyKey,
                }, JSON.stringify(body), {tlsVerify: target.tlsVerify !== false});
                const {text} = res;
                if (!res.ok) {
                    // Never log the token
                    global.logger.error(`${what}: HTTP ${res.status} ${text.slice(0, 300)}`);
                    return false;
                }
                // 200: accepted (the agent runs and delivers the answer itself)
                global.logger.info(`${what}: accepted ${text.slice(0, 200)}`);
                return true;
            } catch (e) {
                if (attempt < RETRIES) {
                    debug('%s: %s, retry', what, errorText(e));
                    continue;
                }
                global.logger.error(`${what}: ${errorText(e)}`);
                return false;
            }
        }
        return false;
    }
}

module.exports = OpenClaw;
