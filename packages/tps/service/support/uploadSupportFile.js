const psEnv = require("@ps/env/tps");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { ulid } = require("ulid");
const s3 = require("../../config/aws");

// Uploads an in-memory multer file buffer to S3 under support/ and returns
// the object key + metadata. Mirrors fileUploadController's pattern (no
// multer-s3, no ACL — the bucket enforces object ownership). The key is
// stored as-is; frontends resolve it against the assets CDN domain.
async function uploadSupportFile(file) {
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const key = `support/${ulid()}-${safeName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: psEnv.AWS_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return {
    url: key,
    key,
    name: file.originalname,
    type: file.mimetype,
    size: file.size,
  };
}

module.exports = uploadSupportFile;
