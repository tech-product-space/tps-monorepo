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

const { recordSesLog } = require("./sesLogger");

// Keeps backward-compat string return ("success" | "failed") for legacy
// callers. New callers that need the provider message id should pass an
// `out` object: it will be mutated with `{ providerMessageId }` on success.
// `id` is an optional correlation token attached to the outgoing mail
// (SES Tags / Graph custom header) so webhooks can map back to a node run.
// `headers` is an optional array of extra { name, value } headers
// (currently honored by Graph providers; SES helpers ignore).
// `meta` is optional context about caller: { source, sourceId, sourceName, extra }
async function sendEmail({ to, subject, html, from, fromName, id, headers, out, meta }) {
  const isSes = from === "noreply@theproductspace.in" || from === "noreply@gradientlearnings.org";

  try {
    if (!from) {
      if (isSes) {
        recordSesLog({ to, subject, html, from, fromName, id, status: "FAILED", errorMessage: "Missing 'from' address", meta });
      }
      return "failed";
    }

    const provider = PROVIDERS[from];
    if (!provider) {
      if (isSes) {
        recordSesLog({ to, subject, html, from, fromName, id, status: "FAILED", errorMessage: `Unknown provider for from=${from}`, meta });
      }
      return "failed";
    }

    const result = await provider({ to, subject, html, fromName, id, headers });

    const providerMessageId = result?.providerMessageId || null;
    if (out && typeof out === "object") {
      out.providerMessageId = providerMessageId;
    }

    updateSenderEmailUsage(from).catch(() => {});

    if (isSes) {
      recordSesLog({
        to,
        subject,
        html,
        from,
        fromName,
        id,
        providerMessageId,
        status: "SENT",
        meta,
      });
    }

    return "success";
  } catch (error) {
    console.error("Email sending failed:", error);

    if (isSes) {
      recordSesLog({
        to,
        subject,
        html,
        from,
        fromName,
        id,
        status: "FAILED",
        errorMessage: error?.message || String(error),
        meta,
      });
    }

    return "failed";
  }
}

module.exports = sendEmail;
