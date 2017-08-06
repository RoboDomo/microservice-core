import Config from '../Config'
import StatefulEmitter from './StatefulEmitter'
import MQTT from './MQTT'

// TODO: merge with HostBase?

/**
 * Handy base class for APIs.
 *
 * An API is a singleton that accumulates state via inbound MQTT status messages.
 * When an inbound MQTT message changes the API's state, a 'statechange' message is fired.
 *
 * It is expected that there would be numerous listeners on any given API.  For example,
 * the API controlling status for your AV receiver might have listeners for volume controls
 * on assorted app screens.
 *
 * Sometimes you don't care about events but just want to query the state.  For example,
 * the WeatherAPI might be of interest to logic that cares about sunries/sunset, temperature,
 * etc.  Simply access WeatherAPI.state to get the API's state.
 *
 * State is automatically stored in localStorage and restored initially from localStorage on browser
 * reload.  This allows _some_ semblence of reasonable state to use for initial rendering.  The incoming
 * MQTT messages may be numerous and could take a few seconds to otherwise fully populate the state
 * with current values.
 *
 * For controlling devices via MQTT, this base class provides a set(key, value) method, which publishes a
 * ```topic/set/key => value``` message via MQTT.
 *
 */
export default class APIBase extends StatefulEmitter {
    // override this if you don't want to listen on /status/#
    statusTopic(topic) {
        return topic + '/status/'
    }

    // override this if you don't want to send comamnds to /set
    setTopic(topic) {
        return topic + '/set/'
    }

    constructor(config, base) {
        super()

        const me = this

        me.config = config
        me.device = config.device
        me.topic = base ? base + '/' + me.device : me.device
        me.status_topic = this.statusTopic(me.topic)
        me.set_topic = this.setTopic(me.topic)
        me._state = localStorage.getItem(me.status_topic)
        if (me._state) {
            me._state = JSON.parse(me._state)
        }
        me._on = this.on.bind(this)
        me.onMessage = this.onMessage.bind(this)
        me.mqtt = new MQTT(Config.mqtt.host, Config.mqtt.port)
        me.mqtt.on('connect', () => {
            me.mqtt.on('message', me.onMessage.bind(this))
            me.mqtt.subscribe(me.status_topic + '#')
        })
        me.mqtt.connect()
    }

    on(event, fn) {
        this.addListener(event, fn)
        if (event === 'statechange' && this._state) {
            this.emit('statechange', this._state)
        }
    }

    un(event, fn) {
        this.removeListener(event, fn)
    }

    /**
     * Map a given key/value to the key/value desired in this API's state.
     *
     * For example, incoming Autelis/pool message might be key 'aux1' value 'on',
     * but the pool installer has assigned aux1 to the pool light.  So we can
     * remap 'aux1' to 'poolLight' by overriding this method.
     *
     * @param key
     * @param value
     * @returns {{key: value}}
     */
    mapValue(key, value) {
        const newState = {}
        newState[key] = value
        return newState
    }

    onMessage(topic, data) {
        topic = topic.substr(this.status_topic.length)
        const oldState = this._state

        try {
            data = JSON.parse(data)
        }
        catch (e) {}
        this.state = this.mapValue(topic, data)
        this.emit('statechange', this.state, oldState)
    }

    set state(o) {
        const oldState = this._state
        this._state = Object.assign(this._state || {}, o)
        localStorage.setItem(this.status_topic, JSON.stringify(this._state))
        this.emit('statechange', this._state, oldState)
    }

    get state() {
        return this._state
    }

    set(key, value) {
        this.mqtt.publish(this.set_topic + key, String(value))
    }
}
