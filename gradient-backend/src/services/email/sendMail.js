import { getTransporters, getTransporterByEmail } from "./emailManager.js";
import { DEFAULT_SENDER_EMAIL, DEFAULT_SENDER_NAME } from "./config/constants.js";

/**
 * Sends one email across registered email transports.
 * AWS SES dispatches are guaranteed to be logged at the driver level in aws.provider.js.
 *
 * **Never throws.** It resolves `{ success: false, error }` — including when
 * the sender has no registered provider — so every caller must check `.success`
 * rather than relying on a try/catch. A `try/catch` alone marks every failure
 * as a success.
 *
 * @param {object}   opts
 * @param {string}   [opts.fromEmail]  pin a sender. Omitted, null or empty
 *   means DEFAULT_SENDER_EMAIL (.env).
 * @param {string}   [opts.fromName]   display name. Defaults to DEFAULT_SENDER_NAME (.env).
 * @param {string}   [opts.source]     categorization (e.g. CAMPAIGN, AUTH_PASSWORD_RESET, etc.)
 * @param {string}   [opts.correlationId] reference label (e.g. Ticket #123, Campaign #45)
 * @param {object}   [opts.metadata]   contextual metadata
 * @returns {Promise<{success: boolean, provider?: string, sender?: string,
 *   messageId?: string|null, error?: string}>}
 */
export async function sendMail({
  fromEmail,
  fromName,
  to,
  subject,
  html,
  text,
  attachments = [],
  source,
  correlationId,
  metadata = {},
}) {
  const name = fromName || DEFAULT_SENDER_NAME;

  // `||`, not a default parameter: a caller that reads its sender out of a
  // nullable column passes null rather than omitting the key.
  const sender = fromEmail || DEFAULT_SENDER_EMAIL;

  // Derive source if omitted
  const dispatchSource =
    source ||
    (subject?.toLowerCase().includes("reset")
      ? "AUTH_PASSWORD_RESET"
      : subject?.toLowerCase().includes("invite")
      ? "ADMIN_INVITE"
      : subject?.toLowerCase().includes("certificate")
      ? "CERTIFICATE"
      : subject?.toLowerCase().includes("reminder")
      ? "EVENT_REMINDER"
      : "TRANSACTIONAL");

  try {
    const provider = getTransporterByEmail(sender);

    if (!provider) {
      if (sender !== DEFAULT_SENDER_EMAIL) {
        return { success: false, error: "Provider not found" };
      }

      console.error(
        "DEFAULT_SENDER_EMAIL has no registered provider, falling through:",
        sender,
      );
    }

    if (provider) {
      try {
        const info = await provider.transporter.sendMail({
          to,
          subject,
          html,
          text,
          attachments,
          fromName: name,
          source: dispatchSource,
          correlationId,
          metadata,
        });

        return {
          success: true,
          provider: provider.provider,
          sender: provider.email,
          messageId: info?.messageId ?? null,
        };
      } catch (sendErr) {
        throw sendErr;
      }
    }

    const providers = getTransporters();

    for (const p of providers) {
      try {
        const info = await p.transporter.sendMail({
          to,
          subject,
          html,
          text,
          attachments,
          fromName: name,
          source: dispatchSource,
          correlationId,
          metadata,
        });

        return {
          success: true,
          provider: p.provider,
          sender: p.email,
          messageId: info?.messageId ?? null,
        };
      } catch (err) {
        console.error("Email failed:", p.email, err);
      }
    }

    return { success: false, error: "All providers failed" };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

