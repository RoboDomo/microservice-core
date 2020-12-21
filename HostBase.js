// Microservice Core HostBase
const debug = require("debug")("HostBase"),
  console = require("console"),
  MQTT = require("mqtt"),
  StatefulEmitter = require("./lib/StatefulEmitter");

/**
 * Handler for ^C
 */
process.on("SIGINT", () => {
  debug("*** Exit on SIGINT");
  process.exit(0);
});

/**
 * Handler for unhandled rejected promises.  This should never really get called, but we might expect some
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
    this.retain = true;
    this.host = host;
    this.topic = topic;
    this.setRoot = topic + "/set/";
    this.setRootLength = this.setRoot.length;
    this.statusRoot = topic + "/status/";
    this.alerts = [];

    const client = (this.client = MQTT.connect(this.host));

    if (!custom) {
      client.on("error", (e) => {
        this.exception("MQTT CONNECT ERROR", e);
      });

      client.on("connect", () => {
        debug(
          this.topic,
          "MQTT CONNECT SUCCESS",
          "topic",
          topic,
          this.setRoot + "#"
        );
        client.subscribe(this.setRoot + "#");
        const t = topic.split("/");
        client.subscribe(`${t[0]}/reset/#`);
        if (!custom) {
          this.alert("Notice", `${process.title} running`);
        }
        // TODO: maybe we should subscribe to settings topic and exit if a new settings is received?
      });
    }

    // handle statechange repoted by StatefulEmitter
    this.on("statechange", (newState, oldState) => {
      oldState = oldState || {};
      // debug('statechange', newState, oldState)
      try {
        for (const key in newState) {
          if (key === "_id") {
            // Ignore mongodb's generated _id field.  Clients don't need to see this.
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
          // console.log("onMessage", topic, message.toString());
          const command = topic.substr(this.setRootLength);
          if (message.toString() === "__RESTART__") {
            console.log(this.host, "Got restart message, restarting", topic);
            await client.publish(topic, null, { retain: true });
            await client.publish(topic, null, { retain: false });
            await this.exit(`${process.title} restarting ${topic}`);
            return;
            // process.exit(0);
          } else {
            await this.command(command, message.toString());
          }
        } catch (e) {
          this.exception(e);
        }
      });
    }
  }

  /**
   * publishAlert(packet);
   *
   * Add packet to alerts queue.  If queue runner is not running, then run it
   */
  async publishAlert(packet) {
    this.alerts.push(packet);
    if (this.alert_handle) {
      // queue runner is running
      return;
    }

    this.alert_handle = setInterval(async () => {
      // queue runner;
      console.log("queue runner", this.alerts.length);
      let packet;
      while ((packet = this.alerts.pop())) {
        console.log("queue runner pop", this.alerts.length);
        try {
          this.client.publish("alert", packet, {
            retain: false,
          });
        } catch (e) {
          console.log(this.host, "exception publishAlert() ", e);
        }
      }
      await this.client.publish("alert", null, { retain: false });
      await this.client.publish("alert", null, { retain: true });
      this.client.publish("alert", null);
      if (this.alerts.length === 0) {
        console.log("ClearInterval");
        clearInterval(this.alert_handle);
        this.alert_handle = null;
      }
    }, 100);
  }

  publish(key, value) {
    const topic = this.statusRoot + key,
      o = {};

    o[key] = value;

    //    debug("publish", "topic", topic, "value", value);
    this.client.publish(topic, JSON.stringify(value), {
      retain: true,
    });
  }

  async say(...messages) {
    for (const message of messages) {
      this.client.publish("say", message, { retain: false });
    }
  }

  alert(title, ...message) {
    const packet = JSON.stringify({
      type: "alert",
      host: this.host,
      topic: this.topic,
      setRoot: this.setRoot,
      statusRoot: this.statusRoot,
      title: title,
      message: message,
    });

    debug("alert", packet);
    this.publishAlert(packet);
  }

  warn(title, ...message) {
    const packet = JSON.stringify({
      type: "warn",
      host: this.host,
      topic: this.topic,
      setRoot: this.setRoot,
      statusRoot: this.statusRoot,
      title: title,
      message: message,
    });

    debug("warn", packet);
    this.publishAlert(packet);
  }

  exception(e) {
    console.log(">>>> EXCEPTION", this.setRoot, this.setRoot + "exception", e);
    // we don't want to retain a bunch of exception messages
    // TODO: clear exception message on app start
    this.alert(this.statusRoot + "exception:" + e.stack);
  }

  abort(...message) {
    this.alert("ABORT", ...message);
    setTimeout(() => {
      if (this.alerts.length == 0) {
        process.exit(0);
      }
    }, 10);
  }

  exit(...message) {
    this.alert("EXIT", ...message);
    setInterval(() => {
      if (this.alerts.length == 0) {
        console.log("exiting, alerts length: ", this.alerts.length);
        console.log("exit!");
        process.exit(0);
      } else {
        console.log("exiting, alerts length: ", this.alerts.length);
      }
    }, 10);
  }
}

// get a setting, by name, from mongodb settings database, config collection
HostBase.getSetting = (setting) => {
  const MongoClient = require("mongodb").MongoClient,
    url =
      process.env.ROBODOMO_MONGODB ||
      process.env.MONGO_URL ||
      "mongodb://ha:27017";

  return new Promise(async (resolve, reject) => {
    MongoClient.connect(
      url,
      { useNewUrlParser: true },
      async function (err, database) {
        if (err) {
          return reject(err);
        }
        try {
          const config = await database
            .db("settings")
            .collection("config")
            .findOne({ _id: setting });
          return resolve(config);
        } catch (e) {
          return reject(err);
        }
      }
    );
  });
};

// set a setting (value), by name, in mongodb settings database, config collection
HostBase.putSetting = (setting, value) => {
  const MongoClient = require("mongodb").MongoClient,
    url =
      process.env.ROBODOMO_MONGODB ||
      process.env.MONGO_URL ||
      "mongodb://ha:27017";

  return new Promise(async (resolve, reject) => {
    MongoClient.connect(
      url,
      { useNewUrlParser: true },
      async function (err, database) {
        if (err) {
          return reject(err);
        }
        try {
          const config = await database
            .db("settings")
            .collection("config")
            .replaceOne({ _id: setting }, value);
          return resolve(config);
        } catch (e) {
          return reject(err);
        }
      }
    );
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

//
module.exports = HostBase;
