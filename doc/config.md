# Настройка yandex2mqtt

Все основные настройки моста прописываются в файл `config.js`. Перед запуском обязательно отредактируйте его.
```bash
mv config.orig.js config.js
```

## Примеры конфигов

Доступные примеры:

* В папке [examples](../examples/).
* В моей кнфигурации умного дома: [yandex2mqtt.devices.js](https://github.com/petrows/smarthome-openhab/blob/master/yandex2mqtt.devices.js), там вы можете найти полный пример интеграции, включая адаптацию на стороне системы УД (openHAB).

## Файл конфигурации

Файл конфигурации - модуль `nodejs`, соответственно вы можете использовать какую угодно логику для дедубликации:
шаблоны, функции, циклы и т.п. См пример в папке [examples](examples/).

```js
module.exports = {
  notification: [
    {
      ...
    },
    ...
  ]
  mqtt: {
    ...
  },

  https: {
    ...
  },

  clients: [
    {
      ...
    },
    ...
  ],

  users: [
    {
      ...
    },
    ...
  ],

  devices: [
    {
      ...
    },
    ...
  ]
}
```

### Блок настройки mqtt клиента
Указать данные Вашего MQTT сервера
```js
mqtt: {
    host: 'localhost',
    port: 1883,
    user: 'user',
    password: 'password',
},
```

### Блок настройки https сервера
Указать порт, на котором будет работать мост, а так же пути к сертификату ssl.
```js
https: {
  privateKey: '/etc/letsencrypt/live/your.domain.ru/privkey.pem',
  certificate: '/etc/letsencrypt/live/your.domain.ru/fullchain.pem',
  port: 4433
},
```

### Блок настройки клиентов
Здесь используются произвольные данные, далее они понадобятся для подключения к УД Yandex.
```js
clients: [
    {
        id: '1',
        name: 'Yandex',
        clientId: 'client',
        clientSecret: 'secret',
        isTrusted: false,
    },
],
```

### Блок настройки пользователей
```js
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
```

### Блок настройки устройств

Читается из отдельного файла,

```js
devices: [
    {
        id: 'haw-002-switch',
        name: 'Свет в коридоре',
        room: 'Коридор',
        type: 'devices.types.light',
        allowedUsers: ['2'],
        mqtt: [
            {
                instance: 'on',
                set: '/yandex/controls/light_HaW_002/on',
                state: '/yandex/controls/light_HaW_002/on/state',
            },
        ],
        capabilities: [
            {
                type: 'devices.capabilities.on_off',
                retrievable: true,
            },
        ],
    },

    {
        id: 'lvr-003-switch',
        name: 'Основной свет',
        room: 'Гостиная',
        type: 'devices.types.light',
        allowedUsers: ['2'],
        mqtt: [
            {
                instance: 'on',
                set: '/yandex/controls/light_LvR_003/on',
                state: '/yandex/controls/light_LvR_003/on/state',
            },
        ],
        valueMapping: [
            {
                type: 'on_off',
                mapping: [[false, true], [0, 1]], // [yandex, mqtt]
            },
        ],
        capabilities: [
            {
                type: 'devices.capabilities.on_off',
                retrievable: true,
            },
        ],
    },

    {
        id: 'lvr-001-weather',
        name: 'В гостиной',
        room: 'Гостиная',
        type: 'devices.types.sensor',
        allowedUsers: ['2'],
        mqtt: [
            {
                instance: 'temperature',
                state: '/yandex/sensors/LvR_001_Weather/temperature',
            },
            {
                instance: 'humidity',
                state: '/yandex/sensors/LvR_001_Weather/humidity',
            },
        ],
        properties: [
            {
                type: 'devices.properties.float',
                retrievable: true,
                parameters: {
                    instance: 'temperature',
                    unit: 'unit.temperature.celsius',
                },
            },
            {
                type: 'devices.properties.float',
                retrievable: true,
                parameters: {
                    instance: 'humidity',
                    unit: 'unit.percent',
                },
            },
        ],
    },

    {
        id: 'plug-001-flower',
        name: 'Розетка для цветка',
        room: 'Гостиная',
        type: 'devices.types.socket',
        allowedUsers: ['2'],
        mqtt: [
            {
                instance: 'on',
                set: '/yandex/controls/socket_LvR_002/on',
                state: '/yandex/controls/socket_LvR_002/on/state',
            },
            {
                instance: 'power',
                state: '/yandex/controls/socket_LvR_002/power',
            },
        ],
        capabilities: [
            {
                type: 'devices.capabilities.on_off',
                retrievable: true,
            },
        ],
        properties: [
            {
                type: 'devices.properties.float',
                retrievable: true,
                parameters: {
                    instance: 'power',
                    unit: 'unit.watt',
                },
            },
        ],
    },
    {
        id: 'haw-001-motion',
        name: 'Движение',
        room: 'Коридор',
        type: 'devices.types.sensor',
        allowedUsers: ['2'],
        mqtt: [
            {
                instance: 'motion',
                state: '/yandex/sensors/HaW_001_Motion/motion',
            },
        ],
        valueMapping: [
            {
                type: 'event',
                mapping: [['not_detected', 'detected'], ['false', 'true']], // [yandex, mqtt]
            },
        ],
        properties: [
            {
                type: 'devices.properties.event',
                retrievable: true,
                reportable: true,
                parameters: {
                    instance: 'motion',
                    events: [{
                        value: 'detected'
                    },
                    {
                        value: 'not_detected'
                    }]
                },
            },
        ],
    },
    /* --- end */
],
```

ID должен быть обязательно уникальным, в случае повторений приложение не запустится (это избавляет от очень раздражающей ошибки Yandex - что-то пошло не так, попробуйте позже).

### Уведомление об изменении состояний устройств

Платформа УД Яндекс предоставляет сервис уведомлений об изменении состояний устройств. При изменении состояния устройства (например, изменение влажности) yandex2mqtt будет отправлять запрос с новым состоянием.

В настройках предусмотрен блок `notification`.

```js
notification: [
    {
        skill_id: '6fca0a54-a505-4420-b774-f01da95e5c31',
        oauth_token: 'AQA11AAPv-V2BAT7o_ps6gEtrtNNjlE2ENYt96w',
        user_id: '2'
    },
]
```

Если к yandex2mqtt "подключено" несколько навыков УД, то в массиве необходимо указать настройки для каждого навыка УД, который должен получать уведомления.

`skill_id` (идентификатор вызываемого навыка, присвоенный при создании) и `oauth_token` (авторизационный токен владельца навыка) можно узнать из документации на [Уведомление об изменении состояний устройств](https://yandex.ru/dev/dialogs/smart-home/doc/reference-alerts/post-skill_id-callback-state.html), а `user_id` - id пользователя в файле конфигурации yandex2mqtt.

*Важно. Уведомления будут отправляться при изменнии mqtt топика хранящего состояние устройства. Соответственно, если для устройства не задан топик state, то уведомление для устройтва отправляться не будет.*


### Разрешенные пользователи для устройств (allowedUsers)

В блоке конфигурации можно указать пользователей (id пользователей), для которых будет доступно устройство.

В опции `allowedUsers` указыватся массив (строковых значений) id. Если данная опция не указана, то она доступна всем пользователям.

### Mapping значений

Блок valueMapping позволяет настроить конвертацию значений между yandex api и MQTT. Это может быть актуально для умений типа `devices.capabilities.on_off` и `devices.capabilities.toggle`.

#### Предобразование заданных значений

*Например, если в УД состояние влючено/выключено соответствует значениям 1/0, то Вам понадобиться их конвертировать, т.к. в навыках Yandex значения true/false.*

```js
valueMapping: [
    {
        type: 'on_off',
        mapping: [[false, true], [0, 1]], // [yandex, mqtt]
    },
],
```

В mapping указывается миссив массивов. Первый массив - значения в yandex, второй - в MQTT.

#### Инверсия процентов

Специальный маппинг для инверсии процентов 0..100 в 100..0. Используется в моём случае для исправления
логики штор и жалюзей "100% открыто" и "100% закрыто".

```js
valueMapping: [
    {
        type: 'range',
        mapping: 'invert_percent',
    },
],
```

#### Преобразование функцией

Использования кастомной функции-каллбека конвертации, удобно, когда нужно репортить/управлять
статусом включения устройства исходя из какого-то состояния. Так же можно конвертировать любые значения,
например Кельвины в MIRED и наоборот.

Пример:
* Отоплление "включено" или "выключено" в засисимости от установленной температуры
* Шторы "открыты" или "закрыты" в засисимости от % открытия

```js
// Пример для термостата
valueMapping: [
    {
        type: 'on_off',
        mapping: function(device, instance, value, y2m) {
            // Кастомная функция конвертации
            // device: объект устройства (если нужны какие-то свойства)
            // instance: название инстанса, для которого событие
            // value: значение
            // y2m: направление конвертации, true = Яндекс -> MQTT
            // Сообщим в лог
            logger.debug(`Callback: ${device}, ${instance}, ${value}, ${y2m}`)
            // Направление:
            if (y2m) { // От Яндекс в MQTT
                // Если приходит команда "ВКЛЮЧИ" (true) -> 25°C
                // ВЫКЛЮЧИ -> 5°C
                return value ? 23 : 5
            } else { // От MQTT в Яндекс
                // Если температура больше 17°C -> репортим ВКЛ, иначе ВЫКЛ
                return value > 17
            }
        }
    }
]
```
