'use strict';

const passport = require('passport');
let debug = require('debug')('route:user');

// Allow to print full object
require('util').inspect.defaultOptions.depth = null;

module.exports.info = [
    passport.authenticate('bearer', {session: true}),
    (req, res) => {
        const {user} = req;
        res.json({user_id: user.id, name: user.name, scope: req.authInfo.scope});
    }
];

/* Device of the y2m user (allowedUsers), undefined if unknown / not allowed */
function findUserDevice(id, user) {
    return global.devices.find(d => d.data.id == id && d.isAllowed(user.id));
}

/* HEAD /v1.0: endpoint availability check, sent without a token */
module.exports.heartbeat = (req, res) => {
    res.status(200).end();
};

module.exports.ping = [
    passport.authenticate('bearer', {session: true}),
    (req, res) => {
        res.status(200).send('OK');
    }
];

module.exports.devices = [
    passport.authenticate('bearer', {session: true}),
    (req, res) => {
        const [reqId, authToken] = [req.get('X-Request-Id'), req.get('Authorization').split(' ')[1]];

        try {
            const {userId} = global.authl.findOne({'token': authToken});

            const r = {
                request_id: reqId,
                payload: {
                    user_id: userId,
                    devices: []
                }
            };

            for (const d of global.devices.filter(d => d.isAllowed(userId))) {
                r.payload.devices.push(d.getInfo());
            };

            res.status(200).send(r);
        } catch (e) {
            global.logger.log('error', {message: `${e}`});
            res.status(404).send(undefined);
        }
    }
];

module.exports.query = [
    passport.authenticate('bearer', {session: true}),
    (req, res) => {
        const reqId = req.get('X-Request-Id');
        const r = {
            request_id: reqId,
            payload: {
                devices: []
            }
        };

        global.logger.info(`Query ${reqId}: user ${req.user.id}`);

        for (const d of ((req.body && req.body.devices) || [])) {
            const ldevice = findUserDevice(d.id, req.user);
            if (!ldevice) {
                global.logger.error(`Query ${reqId}: device ${d.id} not found (rescan device list?)`);
                r.payload.devices.push({
                    id: d.id,
                    error_code: 'DEVICE_NOT_FOUND',
                    error_message: 'Device not found',
                });
                continue;
            }
            r.payload.devices.push(ldevice.getState());
        };

        debug('query :: send: %O', r);

        res.status(200).send(r);
    }
];

module.exports.action = [
    passport.authenticate('bearer', {session: true}),
    (req, res) => {
        const reqId = req.get('X-Request-Id');
        const r = {
            request_id: reqId,
            payload: {
                devices: []
            }
        };

        debug('action :: recv: %O', req.body);
        global.logger.info(`Action ${reqId}: user ${req.user.id}`);

        for (const payloadDevice of ((req.body && req.body.payload && req.body.payload.devices) || [])) {
            const {id} = payloadDevice;

            const capabilities = [];
            const ldevice = findUserDevice(id, req.user);

            if (!ldevice) {
                global.logger.error(`Action ${reqId}: device ${id} not found (rescan device list?)`);
                r.payload.devices.push({
                    id,
                    action_result: {
                        status: 'ERROR',
                        error_code: 'DEVICE_NOT_FOUND',
                        error_message: 'Device not found',
                    },
                });
                continue;
            }

            for (const pdc of payloadDevice.capabilities) {
                capabilities.push(ldevice.setCapabilityState(
                    pdc.state.value,
                    pdc.state.relative || false,
                    pdc.type,
                    pdc.state.instance,
                ));
            }

            r.payload.devices.push({id, capabilities});
        };

        res.status(200).send(r);
    }
];

module.exports.unlink = [
    passport.authenticate('bearer', {session: true}),
    (req, res) => {
        const reqId = req.get('X-Request-Id');
        const r = {
            request_id: reqId,
        }

        // Yandex revokes the token anyway: forget it, the next linking
        // issues a new one
        const authToken = (req.get('Authorization') || '').split(' ')[1];
        const ltoken = authToken && global.authl.findOne({'token': authToken});
        if (ltoken) global.authl.remove(ltoken);
        global.logger.info(`Unlink ${reqId}: user ${req.user.id}, token removed: ${Boolean(ltoken)}`);

        res.status(200).send(r);
    }
];
