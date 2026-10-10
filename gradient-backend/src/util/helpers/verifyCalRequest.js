import crypto from "crypto";
import env from "../../config/env.js";

export function verifyCalSignature(req) {
  const secret = process.env.CAL_WEBHOOK_SECRET;

  // If secret is not configured in development, bypass verification with warning
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[CalWebhook] CAL_WEBHOOK_SECRET is not set, bypassing signature verification in development.");
      return true;
    }
    return false;
  }

  const signature = req.headers["x-cal-signature-256"];
  if (!signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  return signature === expectedSignature;
}
