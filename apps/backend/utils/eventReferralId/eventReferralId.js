const crypto = require("crypto");

exports.generateReferralCode = function (length = 8) {
  return crypto
    .randomBytes(length)
    .toString("base64")
    .replace(/[^A-Z0-9]/gi, "")
    .slice(0, length)
    .toUpperCase();
};
