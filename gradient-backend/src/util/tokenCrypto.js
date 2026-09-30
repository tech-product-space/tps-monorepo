import crypto from "crypto";

import env from "../config/env.js";

/**
 * AES-256-GCM for secrets that have to be readable again — currently Facebook
 * page access tokens.
 *
 * A page token can read every lead the page has ever collected, so it does not
 * go in a plaintext column. It cannot be hashed either: the poll needs the
 * original to call Graph, which is why this is encryption and not
 * `util/password.util.js`.
 *
 * Stored format is `"<iv hex>:<auth tag hex>:<ciphertext hex>"`. GCM's tag is
 * what makes a tampered ciphertext fail loudly at `decrypt` instead of
 * returning plausible garbage.
 *
 * The key lives in `TOKEN_ENCRYPTION_KEY` (64 hex chars — `openssl rand -hex
 * 32`) and must be in the deploy secrets before the meta migrations run.
 * **Rotating it invalidates every stored token**; there is no re-wrap path, so
 * every account has to be re-entered by hand afterwards.
 */

const KEY_HEX_LENGTH = 64;
const IV_BYTES = 12;

/**
 * Resolved per call rather than at module load.
 *
 * The whole app imports this file transitively through the models, and a
 * missing key must not stop the server booting for everyone who is not touching
 * the Facebook integration. The failure belongs at the point of use — where the
 * admin gets a 500 with a message naming the variable — not at boot.
 */
const getKey = () => {
  const hex = env.tokenEncryptionKey;

  if (!hex || hex.length !== KEY_HEX_LENGTH) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be set to 64 hex characters (openssl rand -hex 32)",
    );
  }

  return Buffer.from(hex, "hex");
};

/** True when a key is configured, so callers can fail with a useful message. */
export const isTokenCryptoConfigured = () =>
  typeof env.tokenEncryptionKey === "string" &&
  env.tokenEncryptionKey.length === KEY_HEX_LENGTH;

export const encrypt = (plaintext) => {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decrypt = (stored) => {
  const [ivHex, tagHex, dataHex] = String(stored).split(":");

  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted payload format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex"),
  );

  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};

export default { encrypt, decrypt, isTokenCryptoConfigured };
