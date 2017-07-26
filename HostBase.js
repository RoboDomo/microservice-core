const debug           = require('debug')('HostBase'),
      MQTT            = require('mqtt'),
      StatefulEmitter = require('./StatefulEmitter')

function quote(s) {
    return '"' + s + '"'
}
class HostBase extends StatefulEmitter {
    constructor(host, topic) {
        super()
        this.host            = host
        this.topic           = topic
        this.topicRoot       = topic + '/'
        this.topicRootLength = this.topicRoot.length

        this.client = MQTT.connect(this.host)
        this.client.subscribe(this.topicRoot + '#')
        this.on('statechange', (newState, oldState) => {
            oldState = oldState || {}
            for (const key in newState) {
                if (oldState[key] === 'undefined' || oldState[key] !== newState[key]) {
                    debug('publish', key, newState[key])
                    this.publish(key, newState[key])
                }
            }
        })

        this.client.on('message', (topic, message) => {
            this.command(topic.substr(this.topicRoot.length), message.toString())
        })
    }

    publish(key, value) {
        const topic = this.topic + '/' + key
        this.client.publish(topic, String(value))
    }
}

module.exports = HostBase
