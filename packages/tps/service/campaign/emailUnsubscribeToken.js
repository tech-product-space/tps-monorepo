const psEnv = require("@ps/env/tps");
const jwt = require("jsonwebtoken");

function generateUnsubscribeToken(email, campaignId) {
  return jwt.sign(
    { email, campaignId },
    psEnv.UNSUBSCRIBE_SECRET,
    { expiresIn: "7d" }
  );
}

function verifyUnsubscribeToken(token) {
  try {
    return jwt.verify(token, psEnv.UNSUBSCRIBE_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = {
  generateUnsubscribeToken,
  verifyUnsubscribeToken
};
