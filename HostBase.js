/**
 * Created by mschwartz on 7/10/17.
 */

const debug        = require('debug')('HostBase'),
      StatefulEmitter = require('../lib/StatefulEmitter'),
      WebSocket    = require('../lib/WebSocket')

class HostBase extends StatefulEmitter {
    // TODO: take a config
    // TODO: rename device to topic?
    constructor(topic) {
        super()
        this.topic = topic
    }

    setModel(model) {
        this.model = model
    }

    publish() {
        if (WebSocket.publish(this.topic, this.state)) {
            // debug(this.topic, 'publish')
            this.emit('publish')

            const model = this.model
            if (model) {
                setTimeout(async () => {
                    try {
                        await model.create(Object.assign({
                            timestamp: new Date(),
                            name: this.device,
                        }, this.state))
                    }
                    catch (e) {
                        console.log(this.topic, 'db error', e)
                    }
                }, 1)
            }
        }
    }

    async asyncConfigure() {
        Promise.resolve()
    }
}

module.exports = HostBase
