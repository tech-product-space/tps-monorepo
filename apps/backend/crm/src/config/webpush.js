const webpush = require("web-push");

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:rahib@theproductspace.co.in";

let configured = false;

if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  console.log("🟢 Web Push configured");
} else {
  console.warn(
    "🔴 Web Push disabled — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in env",
  );
}

module.exports = {
  webpush,
  publicKey: PUBLIC_KEY,
  isConfigured: () => configured,
};
