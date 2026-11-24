'use strict';

/*
 * Common logic of the message targets (telegram.js, openclaw.js): filters
 * by y2m user / device and the message templates.
 */

/**
 * Target accepts messages of the y2m user and the device: `users` (y2m user
 * ids) and `devices` (device names or application_ids) not set: any.
 */
function matches(target, userId, device) {
    const dev = device || {};
    return (!Array.isArray(target.users) || target.users.indexOf(userId) > -1)
        && (!Array.isArray(target.devices) || target.devices.indexOf(dev.name) > -1 || target.devices.indexOf(dev.id) > -1);
}

/**
 * `template` with `%s` replaced by the text and `%d` by the device name
 * (template not set: `fallback`).
 */
function format(template, text, device, fallback = '%s') {
    const tpl = template === undefined ? fallback : String(template);
    const name = (device && device.name) || '';
    // One pass, function replacement: no substitution inside the text,
    // no special `$` patterns
    return tpl.replace(/%[sd]/g, m => (m === '%s' ? text : name));
}

/* Log an error for a template that would drop the phrase */
function checkTemplate(what, template) {
    if (template !== undefined && String(template).indexOf('%s') === -1) {
        global.logger.error(`${what}: template without %s, the phrase is not sent`);
    }
}

module.exports = {matches, format, checkTemplate};
