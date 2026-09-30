require("dotenv").config();

const crypto = require("crypto");

/**
 * Verify a Cal.com webhook signature.
 *
 * `secret` is per-account (see config/calcom.js); it falls back to the original
 * single-account env so any caller that predates multi-account still works.
 * A missing secret rejects — an unconfigured account must fail closed.
 *
 * Known carry-over: this HMACs `JSON.stringify(req.body)`, i.e. the payload
 * re-serialised after express.json() parsed it, rather than the raw bytes
 * Cal.com actually signed. It holds only because their payloads survive the
 * round-trip; a float like `"price": 0.0` would 401. Fixing it needs
 * express.raw() + a rawBody capture, and would have to be re-proven against
 * every live account at once — tracked separately, deliberately not bundled
 * with the multi-account change.
 */
function verifyCalSignature(req, secret = process.env.CAL_WEBHOOK_SECRET) {
  if (!secret) return false;

  const signature = req.headers["x-cal-signature-256"];
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  return signature === expectedSignature;
}

module.exports = { verifyCalSignature };
