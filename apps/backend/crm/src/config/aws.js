const { S3Client } = require("@aws-sdk/client-s3");

/**
 * Shared S3 client. Plain AWS S3 (no `endpoint` / `forcePathStyle`) against the
 * same bucket the marketing site uses, so no new bucket or IAM user is needed.
 *
 * Safe to build at module load: dotenv.config() runs at the top of index.js,
 * before any route (and therefore any service) is required.
 *
 * Requires AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
 *
 * There are two buckets, and the distinction matters:
 *   AWS_BUCKET_NAME          - the shared asset bucket. Its policy grants
 *                              s3:GetObject to Principal:"*", so EVERYTHING in
 *                              it is world-readable. Public assets only.
 *   AWS_PRIVATE_BUCKET_NAME  - public access blocked, AES256 at rest. Anything
 *                              carrying customer data (payment proofs) goes
 *                              here and is read via presigned URLs.
 *
 * Consumers read the bucket name inline so a missing one surfaces as a
 * request-time error rather than a silent undefined captured at boot.
 */
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const isS3Configured = () =>
  Boolean(
    process.env.AWS_REGION &&
      process.env.AWS_PRIVATE_BUCKET_NAME &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY,
  );

module.exports = s3;
module.exports.s3 = s3;
module.exports.isS3Configured = isS3Configured;
