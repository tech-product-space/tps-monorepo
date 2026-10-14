// lib/uploadToS3.js
const { PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3 = require("../config/aws");

const BUCKET = process.env.AWS_BUCKET_NAME;

async function uploadPDFToS3(buffer, key) {
  try {    
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
    }));
    return { bucket: BUCKET, key };
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw new Error("Upload to S3 failed");
  }
}

async function uploadImageToS3(buffer, key, contentType = "image/png", metadata) {
  try {    
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ...(metadata ? { Metadata: metadata } : {}),
    }));
    return { bucket: BUCKET, key };
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw new Error("Upload to S3 failed");
  }
}

async function getS3ObjectMetadata(key) {
  try {
    const result = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return result.Metadata || {};
  } catch (error) {
    // Only a missing object is repairable; permission/network errors must surface.
    if (error.$metadata?.httpStatusCode === 404 || error.name === "NotFound") return null;
    throw error;
  }
}

/**
 * Get a presigned GET URL for an S3 object.
 *
 * @param {Object} opts
 * @param {string} opts.key - S3 object key (e.g., "certificates/u1-e2.pdf")
 * @param {string} [opts.bucket] - S3 bucket (defaults to env BUCKET)
 * @param {"inline"|"attachment"} [opts.disposition="inline"] - inline=view, attachment=download
 * @param {string} [opts.filename="file.pdf"] - Suggested filename for browser
 * @param {number} [opts.expiresIn=3600] - Expiry in seconds (default 1 hour)
 * @returns {Promise<string>} - The presigned URL
 */
async function getSignedS3Url({
  key,
  bucket = BUCKET,
  disposition = "inline",
  filename,
  contentType = "image/png",
  expiresIn = 60 * 60,
  cacheControl,
}) {
  if (!bucket) throw new Error("Missing S3 bucket (env AWS_S3_BUCKET or pass bucket)");
  if (!key) throw new Error("Missing S3 object key");

  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: `${disposition}; filename="${filename}"`,
    ...(cacheControl ? { ResponseCacheControl: cacheControl } : {}),
  });

  return getSignedUrl(s3, cmd, { expiresIn });
}


module.exports = { uploadPDFToS3, uploadImageToS3, getSignedS3Url, getS3ObjectMetadata };
