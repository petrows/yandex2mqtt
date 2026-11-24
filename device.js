const {logger} = global;
let debug = require('debug')('device');

// Allow to print full object
require('util').inspect.defaultOptions.depth = null;

/* function for convert system values to Yandex (depends of capability or property type) */
function convertToYandexValue(val, actType) {
    switch(actType) {
        case 'range':
        case 'float': {
            if (val == undefined) return 0.0;
            try {
                const value = parseFloat(val);
                return isNaN(value) ? 0.0 : value;
            } catch(e) {
                logger.log('error', {message: `Can't parse to float: ${val}`});
                return 0.0;
            }
        }
        case 'toggle':
        case 'on_off': {
            if (val == undefined) return false;
            if (['open', 'true', 'on', '1'].indexOf(String(val).toLowerCase()) != -1) return true;
            else return false;
        }
        // Auto detect number and convert it
        case 'color_setting': {
            if (!isNaN(val)) {
                return +val;
            } else {
                return val;
            }
        }
        default:
            return val;
    }
}

/* Device class defenition */
class Device {
    constructor(options) {
        const id = options.id;
        this.data = {
            id: options.id || String(id),
            name: options.name || 'Без названия',
            description: options.description || '',
            room: options.room || '',
            type: options.type || 'devices.types.light',
            custom_data: {
                mqtt: options.mqtt || [],
                valueMapping: options.valueMapping || [],
            },
            capabilities: (options.capabilities || []).map(c => Object.assign({}, c, {state: (c.state == undefined) ? this.initState(c) : c.state})),
            properties: (options.properties || []).map(p => Object.assign({}, p, {state: (p.state == undefined) ? this.initState(p) : p.state})),
        };
        this.meta = {
            // Not set: no access separation, the device is available to every user
            allowedUsers: options.allowedUsers,
        };
    }

    /* Device is available to the y2m user (allowedUsers not set: to everyone) */
    isAllowed(userId) {
        const {allowedUsers} = this.meta;
        return !Array.isArray(allowedUsers) || allowedUsers.indexOf(userId) > -1;
    }

    /*  Create init state (for capabilities and properties) on device object create */
    initState(cp) {
        const {type, parameters} = cp;
        const actType = String(type).split('.')[2];

        switch(actType) {
            case 'float': {
                return {
                    instance: parameters.instance,
                    value: 0
                }
            }
            case 'on_off': {
                return {
                    instance: 'on',
                    value: false
                }
            }
            case 'mode': {
                return {
                    instance: parameters.instance,
                    value: parameters.modes[0].value
                }
            }
            case 'range': {
                return {
                    instance: parameters.instance,
                    value: parameters.range.min
                }
            }
            case 'toggle': {
                return {
                    instance: parameters.instance,
                    value: false
                }
            }
            case 'event': {
                return {
                    instance: parameters.instance,
                    value: undefined
                }
            }
            default: {
                logger.log('error', {message: `Unsupported capability type: ${type}`});
                return undefined;
            }
        }

    }

    /* Find capability by type (and instance) */
    findCapability(type, instance) {
        const {capabilities} = this.data;
        if (instance != undefined) {
            return capabilities.find(c => c.type === type && c.state.instance === instance);
        } else {
            return capabilities.find(c => c.type === type);
        }
    }

    /* Find property by type (and instance) */
    findProperty(type, instance) {
        const {properties} = this.data;
        if (instance != undefined) {
            return properties.find(p => p.type === type && p.state.instance === instance);
        } else {
            return properties.find(p => p.type === type);
        }
    }

    /* Find 'set' topic by instance*/
    findTopicByInstance(instance) {
        return this.data.custom_data.mqtt.find(i => i.instance === instance).set;
    }

    /* Get mapped value (if exist) for capability type */
    /**
     *
     * @param {*} val value
     * @param {*} actType capability type
     * @param {*} instance capability instance
     * @param {*} y2m mapping direction (yandex to mqtt, mqtt to yandex)
     */
    getMappedValue(val, actType, instance, y2m) {
        const map = this.data.custom_data.valueMapping.find(m => m.type == actType);
        if (map == undefined) return val;

        // Percent invert
        if (map.mapping == 'invert_percent') {
            return 100 - parseInt(val)
        }

        // Custom function?
        if (map.mapping instanceof Function) {
            return map.mapping(this, instance, val, y2m)
        }

        var from, to;
        if (y2m == true) [from, to] = map.mapping;
        else [to, from] = map.mapping;

        const mappedValue = to[from.indexOf(val)];
        return (mappedValue != undefined) ? mappedValue : val;
    }

    getInfo() {
        const {id, name, description, room, type, capabilities, properties} = this.data;
        return {id, name, description, room, type, capabilities, properties};
    }

    /* Get only needed for response device info (bun not full device defenition) */
    getState () {
        const {id, capabilities, properties} = this.data;
        const device = {
            id,
            capabilities: (() => {
                return capabilities.filter(c => c.retrievable === true).map(c => {
                    return {
                        type: c.type,
                        state: c.state
                    }
                })
            })() || [],
            properties: (() => {
                return properties.filter(p => p.retrievable === true).map(p => {
                    return {
                        type: p.type,
                        state: p.state
                    }
                })
            })() || [],
        }

        return device;
    }

    /* Change device capability state and publish value to MQTT topic */
    setCapabilityState(val, relative, type, instance) {
        const {id} = this.data;
        const actType = String(type).split('.')[2];
        const value = this.getMappedValue(val, actType, instance, true);

        let relativePrefix = (relative && value > 0 && !isNaN(value)) ? '+' : ''

        let message;
        let topic;
        try {
            const capability = this.findCapability(type, instance);
            if (capability == undefined) throw new Error(`Can't find capability '${type}' in device '${id}'`);
            capability.state.value = val;
            topic = this.findTopicByInstance(instance);
            if (topic == undefined) throw new Error(`Can't find set topic for '${type}' in device '${id}'`);
            message = `${relativePrefix}${value}`;
        } catch(e) {
            topic = false;
            logger.log('error', {message: `${e}`});
        }

        if (topic) {
            global.mqttClient.publish(topic, message);
        }

        logger.info(`Command ${id}: instance ${instance}, topic ${topic}, command ${val}, message ${message}`)

        // Unknown capability / no set topic: report the error to Yandex
        const action_result = topic
            ? {'status': 'DONE'}
            : {'status': 'ERROR', 'error_code': 'INVALID_ACTION', 'error_message': `Can't set '${instance}'`};

        return {
            type,
            'state': {
                instance,
                action_result,
            }
        }
    }

    /* Update device capability or property state */
    updateState(val, instance) {
        const {id, capabilities, properties} = this.data;

        try {
            const cps = [].concat(capabilities, properties).filter(cp => (cp.state.instance === instance));
            if (cps == undefined) throw new Error(`Can't instance '${instance}' in device '${id}'`);

            cps.forEach((cp) => {
                debug('updateState: %O', cp)

                const actType = String(cp.type).split('.')[2];
                const value = this.getMappedValue(val, actType, instance, false);
                const value_yandex = convertToYandexValue(value, actType);

                cp.state = { instance, value: value_yandex };

                logger.info(`Update ${id}: instance ${instance}, command ${val}, value ${value_yandex}`)
            });
        } catch(e) {
            logger.log('error', {message: `${e}`});
        }
    }
}

module.exports = Device;
