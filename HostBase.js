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
                if (oldState[key] !== 'undefined' && oldState[key] !== newState[key]) {
                    debug('publish', 'key', key, typeof key, 'newState', newState[key], typeof newState[key])
                    this.publish(key, newState[key])
                }
            }
        })

        this.client.on('message', async (topic, message) => {
            try {
                debug('onMessage', topic, message.toString())
                await this.command(topic.substr(this.topicRoot.length), message.toString())
            }
            catch (e) {
                this.client.publish(this.topicRoot + 'exception', e.stack)
            }
        })
    }

    publish(key, value) {
        const topic = this.topicRoot + key
        debug('publish', 'topic', topic, 'key', key, 'value', value)
        this.client.publish(topic, String(value))
    }

    exception(e) {
        debug('exception', this.topicRoot, this.topicRoot + 'exception', e)
        this.publish(this.topicRoot + 'exception', e)
    }
}

module.exports = HostBase
