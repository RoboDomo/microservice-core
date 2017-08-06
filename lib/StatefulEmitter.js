/**
 * StatefulEmitter
 *
 * This base class provides EventEmitter and per instance state.
 *
 */
const debug        = require('debug')('StatefulEmitter'),
      EventEmitter = require('events').EventEmitter

class StatefulEmitter extends EventEmitter {
    constructor() {
        super()
        this._state = null
    }

    get state() {
        return this._state
    }

    set state(value) {
        const oldState = this._state,
              newState = Object.assign({}, oldState || {}, value)

        this._state = newState
        this.emit('statechange', newState, oldState)
    }

    async wait(time) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve()
            }, time)
        })
    }
}

module.exports = StatefulEmitter
