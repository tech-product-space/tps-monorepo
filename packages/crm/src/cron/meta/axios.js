const https = require("https");
const axios = require("axios");

const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000,
  freeSocketTimeout: 30000
});

const axiosClient = axios.create({
  httpsAgent: agent,
  timeout: 15000
});

module.exports = axiosClient;