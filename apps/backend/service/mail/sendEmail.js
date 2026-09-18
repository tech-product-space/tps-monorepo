const sendAwsMail = require("../../utils/email/sendAwsEmail");
const sendAwsGradientMail = require("../../utils/email/sendAwsGradientMail");
const { sendGraphEmail } = require("../../utils/email/sendGraphEmail");
const {
  sendGraphEmailSecondary,
} = require("../../utils/email/sendGraphEmailSecondary");
const {
  sendGraphEmailTertiary,
} = require("../../utils/email/sendGraphEmailTertiary");
const { updateSenderEmailUsage } = require("../../utils/emailSenderUsage");

const PROVIDERS = {
  "info@theproductspace.in": sendGraphEmail,
  "akhil@theproductspace.in": sendGraphEmailSecondary,
  "info@thegradient.co.in": sendGraphEmailTertiary,
  "noreply@theproductspace.in": sendAwsMail,
  "noreply@gradientlearnings.org": sendAwsGradientMail,
};

// Keeps backward-compat string return ("success" | "failed") for legacy
// callers. New callers that need the provider message id should pass an
// `out` object: it will be mutated with `{ providerMessageId }` on success.
// `id` is an optional correlation token attached to the outgoing mail
// (SES Tags / Graph custom header) so webhooks can map back to a node run.
// `headers` is an optional array of extra { name, value } headers
// (currently honored by Graph providers; SES helpers ignore).
async function sendEmail({ to, subject, html, from, fromName, id, headers, out }) {
  try {
    if (!from) return "failed";

    const provider = PROVIDERS[from];
    if (!provider) return "failed";

    const result = await provider({ to, subject, html, fromName, id, headers });

    if (out && typeof out === "object") {
      out.providerMessageId = result?.providerMessageId || null;
    }

    updateSenderEmailUsage(from).catch(() => {});

    return "success";
  } catch (error) {
    console.error("Email sending failed:", error);
    return "failed";
  }
}

module.exports = sendEmail;
