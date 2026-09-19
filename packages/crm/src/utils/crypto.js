"use strict";
const psEnv = require("@ps/env/crm");
const crypto = require("crypto");

/**
 * AES-256-GCM encryption for secrets at rest (Google OAuth tokens).
 * Key: TOKEN_ENCRYPTION_KEY env — 64 hex chars (`openssl rand -hex 32`).
 * Stored format: "<iv hex>:<auth tag hex>:<ciphertext hex>".
 */

function getKey() {
  const hex = psEnv.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be set to 64 hex characters (openssl rand -hex 32)",
    );
  }
  return Buffer.from(hex, "hex");
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(stored) {
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
}

module.exports = { encrypt, decrypt };
