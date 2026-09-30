const { ulid } = require("ulid");

function generateVisitorId() {
  return ulid();
}

module.exports = generateVisitorId;