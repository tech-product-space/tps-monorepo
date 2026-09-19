const psEnv = require("@ps/env/tps");
require("dotenv").config(); 
const { SESClient } = require("@aws-sdk/client-ses");

const sesClient = new SESClient({
  region: psEnv.AWS_SES_REGION,
  credentials: {
    accessKeyId: psEnv.AWS_SES_ACCES_KEY,
    secretAccessKey: psEnv.AWS_SES_SECRET_KEY,
  },
});

module.exports = sesClient;