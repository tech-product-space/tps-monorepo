const multer = require("multer");
const {
  PROOF_MAX_FILES,
  PROOF_MAX_BYTES,
} = require("../config/constants/payment");

/**
 * Payment-proof uploads: screenshots and receipts, not media, so the ceiling is
 * well below the app's generic limits.
 *
 * memoryStorage because the buffer goes straight to S3 — nothing is ever
 * written to the container's disk, which is ephemeral anyway.
 *
 * Type validation deliberately does NOT live in a multer fileFilter: the real
 * check reads the file's magic bytes (paymentProof.storage#assertValidProofFile)
 * and a fileFilter only sees the browser's claimed Content-Type.
 */
const uploadPaymentProof = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PROOF_MAX_BYTES,
    files: PROOF_MAX_FILES,
  },
});

module.exports = uploadPaymentProof;
