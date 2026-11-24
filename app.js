'use strict';

/* First - prepare CLI args and logger */
const { parseArgs } = require('node:util');

/* Extract arguments */
const clArgv = process.argv.slice(2);

const options = {
    // --help option
    help: {
        type: 'boolean',
        short: 'h',
    },
    // --log option
    log: {
        type: 'string',
        default: 'debug',
    },
    // --cfg option
    cfg: {
        type: 'string',
        default: 'data/config.js',
    },
    // --devices option
    devices: {
        type: 'string',
        default: 'data/devices.js',
    },
    // --db option
    db: {
        type: 'string',
        default: 'data/db.json',
    },
    // --dump option
    dump: {
        type: 'boolean',
    },
};

/* Parse args */
global.cli = parseArgs({ clArgv, options }).values;
/* Copy to global scope */
const {cli} = global;

/* Help requested? */
if (cli.help) {
    console.log("Tool to listen Yandex Alice service and map devices to/from MQTT");
    console.log("Command line options:");
    console.log("--help    This help");
    console.log("--log     Log level, possible values: debug, info, error");
    console.log("--cfg     Path to common config file (without .js extension), default is data/config");
    console.log("--devices Path to devce config file (without .js extension), default is data/devices");
    console.log("--db      Path to application state database, default is data/db.json");
    console.log("--dump    Display result configration and exit");
    console.log("");
    return 0;
}

/* Basic imports */
const { createLogger, format, transports } = require('winston');

/* Logging */
global.logger = createLogger({
    level: cli.log,
    format: format.combine(
        format.errors({ stack: true }),
        format.timestamp(),
        format.printf(({ level, message, timestamp, stack }) => {
            return `${timestamp} ${level}: ${stack != undefined ? stack : message}`;
        }),
    ),
    transports: [
        new transports.Console({
            silent: false,
        })
    ],
});

let debug = require('debug')('app');

// Allow to print full object
require('util').inspect.defaultOptions.depth = null;

/* load common config */
const config = require(cli.cfg);
config.notification = config.notification || [];
const configDevices = require(cli.devices);

if (cli.dump) {
    const util = require('util');
    logger.info("Config:");
    logger.info(util.inspect(config, false, null, true));
    logger.info("Devices:");
    logger.info(util.inspect(configDevices, false, null, true));
    return 0
}

/* At least one server: http (behind a TLS reverse proxy) and / or https */
if (!config.http && !config.https) {
    logger.error("Config: neither 'http' nor 'https' block is set, nothing to listen on");
    process.exit(1);
}
if (config.http && !config.http.port) {
    logger.error("Config: 'http.port' is not set");
    process.exit(1);
}
if (config.https && !(config.https.port && config.https.privateKey && config.https.certificate)) {
    logger.error("Config: 'https' block needs 'port', 'privateKey' and 'certificate'");
    process.exit(1);
}

const fs = require('fs');
const path = require('path');

/* express and https */
const ejs = require('ejs');
const express = require('express');
const app = express();
const http = require('http');
const https = require('https');
/* parsers */
const cookieParser = require('cookie-parser');
/* error handler */
const errorHandler = require('errorhandler');
/* seesion and passport */
const session = require('express-session');
const passport = require('passport');
/* mqtt client for devices */
const mqtt = require('mqtt');

const Device = require('./device');

/* */
app.engine('ejs', ejs.__express);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, './views'));
app.use(express.static('views'));
app.use(cookieParser());
app.use(express.json({
    extended: false,
}));
app.use(express.urlencoded({
    extended: true,
}));
app.use(errorHandler());
app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
}));

/* passport */
app.use(passport.initialize());
app.use(passport.session());

/* passport auth */
require('./auth');

/* routers */
const {site: r_site, oauth2: r_oauth2, user: r_user, client: r_client} = require('./routes');

app.get('/', r_site.index);
app.get('/login', r_site.loginForm);
app.post('/login', r_site.login);
app.get('/logout', r_site.logout);
app.get('/account', r_site.account);
app.get('/dialog/authorize', r_oauth2.authorization);
app.post('/dialog/authorize/decision', r_oauth2.decision);
app.post('/oauth/token', r_oauth2.token);
app.get('/api/userinfo', r_user.info);
app.get('/api/clientinfo', r_client.info);
// Endpoint availability check by Yandex (periodic HEAD, no token): must be
// registered before the GET routes (express answers HEAD with them, they
// require the bearer token -> 401)
app.head(['/provider/v1.0', '/provider'], r_user.heartbeat);
app.get('/provider/v1.0', r_user.ping);
app.get('/provider', r_user.ping);
app.get('/provider/v1.0/user/devices', r_user.devices);
app.post('/provider/v1.0/user/devices/query', r_user.query);
app.post('/provider/v1.0/user/devices/action', r_user.action);
app.post('/provider/v1.0/user/unlink', r_user.unlink);

/* Alice dialog skill -> Telegram */
const Telegram = require('./telegram');
const telegram = new Telegram(config.telegram);
const r_alice = require('./routes/alice')(config, telegram);
app.post('/alice', r_alice.webhook);
if (!telegram.enabled) {
    logger.info('Telegram: not configured, /alice messages are dropped');
}

/* create http / https servers (at least one, checked above) */
if (config.http) {
    http.createServer(app).listen(config.http.port, () => {
        logger.info(`HTTP: listening on port ${config.http.port}`);
    });
}
if (config.https) {
    const credentials = {
        key: fs.readFileSync(config.https.privateKey, 'utf8'),
        cert: fs.readFileSync(config.https.certificate, 'utf8'),
    };
    https.createServer(credentials, app).listen(config.https.port, () => {
        logger.info(`HTTPS: listening on port ${config.https.port}`);
    });
}

/* cache devices from config to global */
global.devices = [];
// Check device IDs uniq
let deviceIds = [];
if (configDevices.devices) {
    configDevices.devices.forEach(opts => {
        let dev = new Device(opts);
        let devID = dev.getInfo().id
        if (deviceIds.indexOf(devID) > -1) {
            throw new Error('Duplicating device ID: ' + devID);
        }
        global.devices.push(dev);
        deviceIds.push(devID);
    });
}

/* create subscriptions array */
const subscriptions = [];
global.devices.forEach(device => {
    device.data.custom_data.mqtt.forEach(mqtt => {
        const {instance, state: topic} = mqtt;
        if (instance != undefined && topic != undefined) {
            subscriptions.push({deviceId: device.data.id, instance, topic});
        }
    });
});

/* Create MQTT client (variable) in global */
global.mqttClient = mqtt.connect(`mqtt://${config.mqtt.host}`, {
    port: config.mqtt.port,
    username: config.mqtt.user,
    password: config.mqtt.password
}).on('connect', () => { /* on connect event handler */
    mqttClient.subscribe(subscriptions.map(pair => pair.topic));
    logger.info("MQTT: connected");
}).on('offline', () => { /* on offline event handler */
    logger.info("MQTT: disconnected");
}).on('message', (topic, message) => { /* on get message event handler */
    const subscriptionTriggered = subscriptions.filter(sub => topic.toLowerCase() === sub.topic.toLowerCase());
    if (subscriptionTriggered == undefined) return;

    subscriptionTriggered.forEach(subscription => {
        debug("Subscription: %o", subscription);

        const { deviceId, instance } = subscription;
        const ldevice = global.devices.find(d => d.data.id == deviceId);
        ldevice.updateState(`${message}`, instance);

        /* Make Request to Yandex Dialog notification API */
        Promise.all(config.notification.map(el => {
            let { skill_id, oauth_token, user_id } = el;

            return new Promise(resolve => {
                let req = https.request({
                    hostname: 'dialogs.yandex.net',
                    port: 443,
                    path: `/api/v1/skills/${skill_id}/callback/state`,
                    method: 'POST',
                    headers: {
                        'Content-Type': `application/json`,
                        'Authorization': `OAuth ${oauth_token}`
                    }
                }, res => {
                    res.on('data', d => {
                        global.logger.debug(d);
                    });
                });

                req.on('error', error => {
                    global.logger.error(error);
                });

                let { id, capabilities, properties } = ldevice.getState();
                let resp = {
                    "ts": Math.floor(Date.now() / 1000),
                    "payload": {
                        "user_id": `${user_id}`,
                        "devices": [{
                            id,
                            capabilities: capabilities.filter(c => c.state.instance == instance),
                            properties: properties.filter(p => p.state.instance == instance)
                        }],
                    }
                };
                debug("Message :: resp : %O", resp);
                req.write(JSON.stringify(resp));

                req.end();

                resolve(true);
            });
        }));
    })
});

module.exports = app;
