// Microservice client MQTT

/**
 * @example
 *
 * const mqtt = new mqtt()
 * mqtt.on('connect', () => {
 *    console.log('mqtt connect')
 *    mqtt.subscribe('denon/#')
 *    mqtt.subscribe('tivo/#')
 * })
 * mqtt.on('message', (topic, message) => {
 *     console.log('message', 'topic', topic, 'message', message)
 * })
 * mqtt.connect()
 *
 */
import EventEmitter from 'events'
import './mqtt-mosquitto'

const RETRY_TIME = 2000

export default class MQTT extends EventEmitter {
    constructor(host) {
        super()

        const {h, p} = host
            .replace('mqtt://', '')
            .split(':')

        this.host = h
        this.port = p
        this.connect = this.connect.bind(this)
        this.subscriptions = {}

        const mqtt = this.mqtt = new Paho.MQTT.Client(
            this.host,
            this.port,
            "web_" + parseInt(Math.random() * 100, 10)
        )

        this.onConnect = this.onConnect.bind(this)
        this.onFailure = this.onFailure.bind(this)
        this.onMessageArrived = this.onMessageArrived.bind(this)
        this.onConnectionLost = this.onConnectionLost.bind(this)

        mqtt.onConnect        = this.onConnect
        mqtt.onFailure        = this.onFailure
        mqtt.onMessageArrived = this.onMessageArrived
        mqtt.onConnectionLost = this.onConnectionLost

        this.mqtt.connect({
            timeout:      3,
            cleanSession: false,
            onSuccess:    this.onConnect.bind(this),
            onFailure:    this.onFailure.bind(this)
        })
    }

    static connect(host) {
        return new MQTT(host)
    }

    onConnect() {
        this.emit('connect')
    }

    onFailure() {
        console.log('mqtt', 'onFailure')
        this.emit('failure')
        setTimeout(this.connect, RETRY_TIME)
    }

    onMessageArrived(message) {
        const topic = message.destinationName,
              payload = message.payloadString

        // console.log('message', topic)
        this.emit('message', topic, payload)
    }

    onConnectionLost({errorCode, errorMessage}) {
        console.log('mqtt', 'onConnectionLost', errorMessage, this.subscriptions)
        this.emit('connectionlost')
        setTimeout(this.connect, RETRY_TIME)
    }

    subscribe(topic) {
        console.log('MQTT subscribe', topic)
        this.subscriptions[topic] = true
        this.mqtt.subscribe(topic)
    }

    publish(topic, message) {
        if (message === Object(message)) {
            message = JSON.stringify(message)
        }
        this.mqtt.send(topic, message)
    }
}