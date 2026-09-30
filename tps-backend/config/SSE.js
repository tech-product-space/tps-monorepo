const SSEManager = require("../utils/SSEManager");

const NotificationSSE = new SSEManager(process.env === 'development');

module.exports = {
    NotificationSSE
}
