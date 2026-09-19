const psEnv = require("@ps/env/tps");
const mongoose = require('mongoose');
require('dotenv').config();

const connectMongoDB = async () => {
  try {
    await mongoose.connect(psEnv.MONGO_DB_URL);
    console.log('MongoDB Connected Successfully');
    return true;
  } catch (err) {
    console.error('MongoDB Connection Error:', err);
    process.exit(1); // optional: exit process if no DB connection
  }
};

module.exports = connectMongoDB;
