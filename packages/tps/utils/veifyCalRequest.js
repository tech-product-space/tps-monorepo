const psEnv = require("@ps/env/tps");
require("dotenv").config();

const crypto = require("crypto");

function verifyCalSignature(req) {
  const signature = req.headers["x-cal-signature-256"];

  const expectedSignature = crypto
    .createHmac("sha256", psEnv.CAL_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  return signature === expectedSignature;
}

module.exports = {verifyCalSignature}