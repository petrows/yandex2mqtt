'use strict';

/*
 * Device state notifications to Yandex (config `notification`):
 * https://yandex.ru/dev/dialogs/smart-home/doc/ru/reference-alerts/post-skill_id-callback-state
 *
 * State updates are collected for `delayMs` and sent as one request per skill
 * (a burst of MQTT updates is one request, not one per topic). A request
 * failed on the network level (a keep-alive connection closed by Yandex:
 * ECONNRESET, ...) is retried.
 */

const debug = require('debug')('notify');

const API_URL = 'https://dialogs.yandex.net/api/v1/skills';
const DEFAULT_DELAY_MS = 500;
const RETRIES = 2;
const TIMEOUT_MS = 10000;

function errorText(e) {
    // fetch: TypeError('fetch failed') with the network error as `cause`
    const cause = e && e.cause;
    if (cause) return `${cause.code || cause.name}: ${cause.message}`;
    return `${e.name}: ${e.message}`;
}

class Notifier {
    /**
     * @param {Array} notifications config `notification`: [{skill_id, oauth_token, user_id}]
     * @param {Object} options {delayMs}
     */
    constructor(notifications, options) {
        this.notifications = notifications || [];
        this.delayMs = (options && options.delayMs) || DEFAULT_DELAY_MS;
        // device -> Set of changed instances
        this.pending = new Map();
        this.timer = null;
    }

    get enabled() {
        return this.notifications.length > 0;
    }

    /* State of `instance` of the device changed: notify (batched) */
    changed(device, instance) {
        if (!this.enabled) return;
        if (!this.pending.has(device)) this.pending.set(device, new Set());
        this.pending.get(device).add(instance);
        if (!this.timer) this.timer = setTimeout(() => this.flush(), this.delayMs);
    }

    flush() {
        this.timer = null;
        const devices = [];
        for (const [device, instances] of this.pending) {
            const {id, capabilities, properties} = device.getState();
            devices.push({
                id,
                capabilities: capabilities.filter(c => instances.has(c.state.instance)),
                properties: properties.filter(p => instances.has(p.state.instance)),
            });
        }
        this.pending.clear();
        if (devices.length === 0) return;

        for (const n of this.notifications) {
            this.send(n, devices);
        }
    }

    async send(notification, devices) {
        const {skill_id, oauth_token, user_id} = notification;
        const body = JSON.stringify({
            ts: Math.floor(Date.now() / 1000),
            payload: {
                user_id: `${user_id}`,
                devices,
            },
        });
        const what = `Notification (skill ${skill_id}, ${devices.length} devices)`;
        debug('%s: %s', what, body);

        for (let attempt = 0; attempt <= RETRIES; attempt++) {
            try {
                const res = await fetch(`${API_URL}/${skill_id}/callback/state`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `OAuth ${oauth_token}`,
                    },
                    body,
                    signal: AbortSignal.timeout(TIMEOUT_MS),
                });
                const text = await res.text().catch(() => '');
                if (!res.ok) {
                    // HTTP error: the request is wrong, a retry doesn't help
                    global.logger.error(`${what}: HTTP ${res.status} ${text.slice(0, 300)}`);
                    return false;
                }
                debug('%s: HTTP %d %s', what, res.status, text);
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

module.exports = Notifier;
