const psEnv = require("@ps/env/tps");
const { S3Client } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: psEnv.AWS_REGION,
  credentials: {
    accessKeyId: psEnv.AWS_ACCESS_KEY_ID,
    secretAccessKey: psEnv.AWS_SECRET_ACCESS_KEY,
  },
});

module.exports = s3;