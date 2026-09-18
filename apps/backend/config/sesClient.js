require("dotenv").config(); 
const { SESClient } = require("@aws-sdk/client-ses");

const sesClient = new SESClient({
  region: process.env.AWS_SES_REGION,
  credentials: {
    accessKeyId: process.env.AWS_SES_ACCES_KEY,
    secretAccessKey: process.env.AWS_SES_SECRET_KEY,
  },
});

module.exports = sesClient;