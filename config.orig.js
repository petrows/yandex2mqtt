module.exports = {
    mqtt: {
        host: 'localhost',
        port: 1883,
        user: 'user',
        password: 'password',
    },

    // Servers: at least one of `http` / `https`, both are possible.
    // http: plain HTTP, only behind a reverse proxy with TLS (Yandex needs HTTPS)
    // http: {
    //     port: 4001,
    // },

    https: {
        privateKey: '/etc/letsencrypt/live/your.domain.ru/privkey.pem',
        certificate: '/etc/letsencrypt/live/your.domain.ru/fullchain.pem',
        port: 4433,
    },

    clients: [
        {
            id: '1',
            name: 'Yandex',
            clientId: 'client',
            clientSecret: 'secret',
            isTrusted: false,
        },
    ],

    users: [
        {
            id: '1',
            username: 'admin',
            password: 'admin',
            name: 'Administrator',
        },
        {
            id: '2',
            username: 'user1',
            password: 'user1',
            name: 'User',
        },
    ],

    // Alice dialog skill -> Telegram (POST /alice), see doc/config.md
    telegram: {
        token: process.env.Y2M_TG_TOKEN,
        targets: [
            {
                chatId: '-1001234567890',
                template: '%s\n#alice #%d',
                // users: ['1'],
                // devices: ['Кухня'],
            },
        ],
    },

    // Alice dialog skill -> OpenClaw agent (webhook), optional, see doc/config.md
    // openclaw: {
    //     targets: [
    //         {
    //             url: 'https://openclaw.example.com/hooks/agent',
    //             token: process.env.Y2M_OPENCLAW_TOKEN,
    //             // Internal CA / self-signed certificate: skip the TLS check
    //             tlsVerify: false,
    //             agentId: 'main',
    //             sessionKey: 'agent:main:telegram:group:-1001234567890',
    //             channel: 'telegram',
    //             to: '-1001234567890',
    //         },
    //     ],
    // },

    alice: {
        // skillIds: ['<skill id of the dialog skill>'],
        // Device names (%d in templates): application_id (see the log) -> name
        // devices: {
        //     '<application_id>': 'Кухня',
        // },
    },

    devices: [
        // Please configure with '--devices ./data/devices.js', see 'config.devices.orig.js'
    ],
};
