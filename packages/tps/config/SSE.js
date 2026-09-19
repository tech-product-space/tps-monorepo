const psEnv = require("@ps/env/tps");
const SSEManager = require("../utils/SSEManager");

const NotificationSSE = new SSEManager(psEnv === 'development');

module.exports = {
    NotificationSSE
}
