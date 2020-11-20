// Microservice Core HostBase
const debug = require("debug")("HostBase"),
  console = require("console"),
  MQTT = require("mqtt"),
  StatefulEmitter = require("./lib/StatefulEmitter");

/**
 * handler for unhandled rejected promises.  This should never really get called, but we might expect some
 * node_module we depend on to be poorly written.
 */
process.on("unhandledRejection", function (reason, p) {
  console.log(
    " reason: ",
    reason,
    "Unhandled Promise Rejection at: Promise ",
    p
  );
  // maybe this should exit so forever will restart.
  // unhandled promise rejection is likely a fatal error.
});

class HostBase extends StatefulEmitter {
  /**
   * constructor
   *
   * @param host - mqtt connect string
   * @param topic - base of topic to subscribe and publish
   * @param custom - true if parent will handle it's own messages
   */
  constructor(host, topic, custom) {
    super();
    this.host = host;
    this.topic = topic;
    this.setRoot = topic + "/set/";
    this.setRootLength = this.setRoot.length;
    this.statusRoot = topic + "/status/";

    const client = (this.client = MQTT.connect(this.host));
    debug(this.host, this.topic, "subscribe", this.setRoot + "#");
    if (!custom) {
      client.on("error", (e) => {
        this.exception("MQTT CONNECT ERROR", e);
      });

      client.on("connect", () => {
        debug(this.topic, "MQTT CONNECT SUCCESS", "topic", this.setRoot + "#");
        client.subscribe(this.setRoot + "#");
        this.alert(this.host, this.topic, "connected")
        // TODO: maybe we should subscribe to settings topic and exit if a new settings is received?
      });
    }

    // handle statechange repoted by StatefulEmitter
    this.on("statechange", (newState, oldState) => {
      oldState = oldState || {};
      // debug('statechange', newState, oldState)
      try {
        for (const key in newState) {
          // Ignore mongodb's generated _id field.  Clients don't need to see this.
          if (key === "_id") {
            continue;
          }
          if (oldState[key] !== newState[key]) {
            //            debug(
            //              "statechange",
            //              "key",
            //              key,
            //              typeof key,
            //              "newState",
            //              newState[key],
            //              typeof newState[key]
            //            );
            this.publish(key, newState[key]);
          }
        }
      } catch (e) {
        this.exception(e);
      }
    });

    if (!custom) {
      client.on("message", async (topic, message) => {
        try {
          if (message.indexOf("exception") !== -1) {
            return;
          }
          //          debug("onMessage", topic, message.toString());
          const command = topic.substr(this.setRootLength);
          if (command === "_RESTART_") {
            debug(this.host, "Got restart message, restarting");
            process.exit(0);
          }
          await this.command(command, message.toString());
        } catch (e) {
          this.exception(e);
        }
      });
    }
  }

  publish(key, value) {
    const topic = this.statusRoot + key,
      o = {};

    o[key] = value;

    debug("publish", "topic", topic, "value", value);
    this.client.publish(topic, JSON.stringify(value), {
      retain: true,
    });
  }

  alert(title, ...message) {
    const packet = JSON.stringify({
      host: this.host,
      topic: this.topic,
      setRoot: this.setRoot,
      statusRoot: this.statusRoot,
      title: title,
      message: message
    });

    console.log(this.host, "alert", packet);

    try {
      this.client.publish("alert", packet, {
        retain: false,
      });
    } catch (e) {
      console.log(this.host, "exception alert() ", e);
    }
  }

  exception(e) {
    console.log(">>>> EXCEPTION", this.setRoot, this.setRoot + "exception", e);
    // we don't want to retain a bunch of exception messages
    // TODO: clear exception message on app start
    this.alert(this.statusRoot + "exception:" + e.stack);
  }
}

// get a setting, by name, from mongodb settings database, config collection
HostBase.getSetting = (setting) => {
  const MongoClient = require("mongodb").MongoClient,
    url = process.env.ROBODOMO_MONGODB || "mongodb://robodomo:27017";

  return new Promise(async (resolve, reject) => {
    MongoClient.connect(url, { useNewUrlParser: true }, async function (
      err,
      database
    ) {
      if (err) {
        return reject(err);
      }
      try {
        const config = await database
          .db("settings")
          .collection("config")
          .findOne({ _id: setting });
        resolve(config);
      } catch (e) {
        reject(err);
      }
    });
  });
};

// set a setting (value), by name, in mongodb settings database, config collection
HostBase.putSetting = (setting, value) => {
  const MongoClient = require("mongodb").MongoClient,
    url = process.env.ROBODOMO_MONGODB || "mongodb://robodomo:27017";

  return new Promise(async (resolve, reject) => {
    MongoClient.connect(url, { useNewUrlParser: true }, async function (
      err,
      database
    ) {
      if (err) {
        return reject(err);
      }
      try {
        const config = await database
          .db("settings")
          .collection("config")
          .replaceOne({ _id: setting }, value);
        resolve(config);
      } catch (e) {
        reject(err);
      }
    });
  });
};

//
// read config from MongoDB (this is a static method)
// use:
// const Config = await HostBase.config(); // try/catch for error handling!
//
HostBase.config = () => {
  return HostBase.getSetting("config");
};

module.exports = HostBase;
