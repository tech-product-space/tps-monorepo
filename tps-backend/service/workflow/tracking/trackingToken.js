"use strict";

const crypto = require("crypto");

// Compact base64url(JSON-payload).base64url(HMAC-SHA256). Self-contained so
// the open/click/unsub endpoints don't need a token table.

function secret() {
  return process.env.TRACKING_SECRET || process.env.JWT_SECRET || "dev-tracking-secret";
}

function b64uEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64uDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function sign(payload) {
  const body = b64uEncode(JSON.stringify(payload));
  const mac = crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest();
  return `${body}.${b64uEncode(mac)}`;
}

function verify(token) {
  if (typeof token !== "string" || token.indexOf(".") < 0) return null;
  const [body, macPart] = token.split(".");
  const expected = crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest();
  const given = b64uDecode(macPart);
  if (expected.length !== given.length) return null;
  if (!crypto.timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(b64uDecode(body).toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
