import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3 from "../config/awsS3.js";
import env from "../config/env.js";
import logger from "./logger.js";

const publicBucket = () => env.s3.bucket;

/**
 * Bucket for objects that must not be publicly readable.
 *
 * Falls back to the public bucket when AWS_PRIVATE_BUCKET_NAME is unset, and
 * says so loudly — see the note in config/env.js. The fallback keeps the
 * feature working; it does not make it private.
 */
let warnedAboutFallback = false;

export const privateBucket = () => {
  if (env.s3.privateBucket) return env.s3.privateBucket;

  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    logger.warn(
      "AWS_PRIVATE_BUCKET_NAME is not set — private objects are going to the " +
        "CDN-backed bucket, where they are publicly readable at " +
        `${env.assets.baseUrl}/<key> regardless of ACL. Presigned URLs and ` +
        "certificate revocation are ineffective until this is set.",
    );
  }

  return env.s3.bucket;
};

/**
 * Fetch an object's bytes.
 *
 * Everything else in this repo only ever writes to S3 — the frontends read
 * through the CDN. Rendering a certificate has to read the background back
 * server-side, so this is the first place that needs it.
 */
export const getObjectBuffer = async (key, { isPrivate = false } = {}) => {
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: isPrivate ? privateBucket() : publicBucket(),
      Key: key,
    }),
  );

  return Buffer.from(await result.Body.transformToByteArray());
};

export const putObject = async ({ key, body, contentType, isPrivate = false }) => {
  await s3.send(
    new PutObjectCommand({
      Bucket: isPrivate ? privateBucket() : publicBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(isPrivate ? { ACL: "private" } : {}),
    }),
  );

  return key;
};

/**
 * Short-lived download URL for a private object.
 *
 * Used for certificates: the verify page mints a fresh URL on every view, so
 * revoking a certificate genuinely stops it being reachable. Never persist what
 * this returns — a stored URL is dead within the hour, which is the bug this
 * design replaces.
 */
export const getPresignedUrl = async ({
  key,
  expiresIn = 15 * 60,
  downloadAs,
  contentType,
  isPrivate = true,
}) => {
  const command = new GetObjectCommand({
    Bucket: isPrivate ? privateBucket() : publicBucket(),
    Key: key,
    ...(downloadAs
      ? { ResponseContentDisposition: `attachment; filename="${downloadAs}"` }
      : {}),
    ...(contentType ? { ResponseContentType: contentType } : {}),
  });

  return getSignedUrl(s3, command, { expiresIn });
};
