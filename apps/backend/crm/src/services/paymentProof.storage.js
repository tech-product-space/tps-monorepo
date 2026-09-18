const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { ulid } = require("ulid");
const s3 = require("../config/aws");
const { PROOF_ALLOWED_MIME } = require("../config/constants/payment");

/**
 * Storage adapter for payment-proof files.
 *
 * Everything the rest of the app knows about proof storage lives behind these
 * four functions, so swapping S3 for another backend is a one-file change.
 *
 * Objects are PRIVATE. They are read only through short-lived presigned URLs
 * issued after an authorization check, because a payment screenshot carries the
 * customer's bank details and must never be anonymously reachable.
 *
 * IMPORTANT: this uses AWS_PRIVATE_BUCKET_NAME, NOT the AWS_BUCKET_NAME the
 * marketing site uses. That bucket's policy grants s3:GetObject to
 * Principal:"*" across the whole bucket, so anything written there is world-
 * readable and presigning it would be theatre. There is deliberately no
 * fallback — an unset variable must fail loudly rather than quietly put
 * customer bank details on the public internet.
 */

const PREFIX = "crm/payment-proofs";

function bucket() {
  const name = process.env.AWS_PRIVATE_BUCKET_NAME;
  if (!name) {
    throw new Error(
      "AWS_PRIVATE_BUCKET_NAME is not set. Payment proofs require a bucket with public access blocked.",
    );
  }
  return name;
}

// Long enough to open and inspect a screenshot, short enough that a URL copied
// out of devtools or a log is useless by the time anyone finds it.
const SIGNED_URL_TTL_SECONDS = 15 * 60;

/**
 * Magic-byte signatures for the formats we accept. The browser-supplied
 * Content-Type is attacker-controlled, so it is never trusted on its own — a
 * .exe renamed to .png announces itself as image/png.
 */
const MAGIC_SIGNATURES = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    // RIFF....WEBP
    mime: "image/webp",
    test: (b) =>
      b.length >= 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
  { mime: "application/pdf", test: (b) => b.toString("ascii", 0, 5) === "%PDF-" },
];

/**
 * Resolve a buffer's real format from its leading bytes.
 * Returns the detected MIME string, or null if it matches nothing we allow.
 */
function detectMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const match = MAGIC_SIGNATURES.find((sig) => sig.test(buffer));
  return match ? match.mime : null;
}

/**
 * Validate one multer memory file. Throws with a user-readable message.
 * Checks the declared type AND the actual bytes, and requires them to agree —
 * JPEG is the one exception, since browsers legitimately send image/jpg.
 */
function assertValidProofFile(file) {
  if (!file || !file.buffer || !file.size) {
    throw new Error("Attachment is empty or unreadable");
  }

  if (!PROOF_ALLOWED_MIME.includes(file.mimetype)) {
    throw new Error(
      `"${file.originalname}" is not an accepted file type. Upload a JPG, PNG, WebP or PDF.`,
    );
  }

  const actual = detectMimeType(file.buffer);
  if (!actual) {
    throw new Error(
      `"${file.originalname}" is not a valid image or PDF. It may be corrupt or renamed.`,
    );
  }

  const declared = file.mimetype === "image/jpg" ? "image/jpeg" : file.mimetype;
  if (actual !== declared) {
    throw new Error(
      `"${file.originalname}" claims to be ${declared} but its contents are ${actual}.`,
    );
  }
}

/** Guard every key we hand to S3 — nothing may reach outside our own prefix. */
function assertKeyInPrefix(key) {
  if (typeof key !== "string" || !key.startsWith(`${PREFIX}/`) || key.includes("..")) {
    throw Object.assign(new Error("Invalid attachment reference"), { statusCode: 400 });
  }
}

/**
 * Upload one validated file. Returns the row shape payment_attachments expects.
 */
async function put(file, paymentId) {
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  const key = `${PREFIX}/${paymentId}/${ulid()}-${safeName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      // No ACL: the bucket has Object Ownership enforced, so passing one throws.
      // Privacy comes from the bucket policy, not from a per-object ACL.
    }),
  );

  return {
    file_key: key,
    file_name: file.originalname,
    mime_type: file.mimetype,
    size_bytes: file.size,
  };
}

/**
 * Issue a short-lived read URL. The caller is responsible for having already
 * authorized the viewer — this function only signs.
 */
async function signedUrl({ key, fileName, mimeType, disposition = "inline" }) {
  assertKeyInPrefix(key);

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentType: mimeType,
      ResponseContentDisposition: `${disposition}; filename="${(fileName || "proof").replace(/"/g, "")}"`,
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}

/**
 * Best-effort delete, used to clean up after a failed record so a rolled-back
 * payment doesn't leave orphaned objects behind. Never throws.
 */
async function remove(key) {
  try {
    assertKeyInPrefix(key);
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket(),
        Key: key,
      }),
    );
  } catch (err) {
    console.error("Payment proof cleanup failed for key", key, err.message);
  }
}

module.exports = {
  put,
  signedUrl,
  remove,
  detectMimeType,
  assertValidProofFile,
  SIGNED_URL_TTL_SECONDS,
};
