const URL = process.env.MONGO_URL,
  mongoose = require("mongoose");

mongoose.Promise = global.Promise;

mongoose.connect(URL);

module.exports = mongoose;
