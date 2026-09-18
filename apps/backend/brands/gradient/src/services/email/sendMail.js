import { getTransporters, getTransporterByEmail } from "./emailManager.js";
import { DEFAULT_SENDER_EMAIL, DEFAULT_SENDER_NAME } from "./config/constants.js";

/**
 * Sends one email.
 *
 * **Never throws.** It resolves `{ success: false, error }` — including when
 * the sender has no registered provider — so every caller must check `.success`
 * rather than relying on a try/catch. A `try/catch` alone marks every failure
 * as a success.
 *
 * @param {object}   opts
 * @param {string}   [opts.fromEmail]  pin a sender. Omitted, null or empty
 *   means DEFAULT_SENDER_EMAIL (.env), so the transactional callers that want
 *   "the normal sender" inherit it and move from one place. Falls through every
 *   provider in order only if that default has no registered transport.
 * @param {string}   [opts.fromName]   display name. Defaults to
 *   DEFAULT_SENDER_NAME (.env); campaigns pass their own. Honoured by SES only
 *   — Graph sends as the mailbox identity and ignores it.
 * @returns {Promise<{success: boolean, provider?: string, sender?: string,
 *   messageId?: string|null, error?: string}>}
 *   `messageId` is the provider's id for the message. SES returns one; Outlook
 *   does not. It is what later delivery events are matched against.
 */
export async function sendMail({
  fromEmail,
  fromName,
  to,
  subject,
  html,
  text,
  attachments = [],
}) {
  const name = fromName || DEFAULT_SENDER_NAME;

  // `||`, not a default parameter: a caller that reads its sender out of a
  // nullable column passes null rather than omitting the key, and "no sender
  // given" has to mean the same thing either way.
  const sender = fromEmail || DEFAULT_SENDER_EMAIL;

  try {
    const provider = getTransporterByEmail(sender);

    // An explicit sender that has no transport is a caller bug — fail rather
    // than quietly send as someone else. The configured default is different:
    // it is worth limping on through the fall-through list below, because an
    // unset or mistyped .env value should not take every transactional email
    // down with it.
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
      const info = await provider.transporter.sendMail({
        to,
        subject,
        html,
        text,
        attachments,
        fromName: name,
      });

      return {
        success: true,
        provider: provider.provider,
        sender: provider.email,
        messageId: info?.messageId ?? null,
      };
    }

    const providers = getTransporters();

    for (const provider of providers) {
      try {
        const info = await provider.transporter.sendMail({
          to,
          subject,
          html,
          text,
          attachments,
          fromName: name,
        });

        return {
          success: true,
          provider: provider.provider,
          sender: provider.email,
          messageId: info?.messageId ?? null,
        };
      } catch (err) {
        console.error("Email failed:", provider.email, err);
      }
    }

    return { success: false, error: "All providers failed" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
