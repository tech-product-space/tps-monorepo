import env from "../../config/env.js";
import { META_ALERT_DEBOUNCE_MS } from "../../config/constants/metaLead.js";
import {
  BODIES,
  buildEmail,
  EMAIL_PROVIDER_ID,
  FOOTERS,
  HEADERS,
  sendMail,
} from "../email/index.js";
import logger from "../../util/logger.js";

/**
 * The one thing this integration cannot afford to fail quietly.
 *
 * Everything else that breaks is visible the moment someone opens the panel: a
 * red badge, an error in the log table, a form producing nothing. An expired
 * token is different only because nobody opens the panel on a Saturday, and by
 * Monday two days of paid-social spend have produced leads that sit at Facebook
 * unread.
 */

/**
 * Mail the operations address that an account's token has died.
 *
 * Debounced on `alertedAt`: the poll hits the same dead token every five
 * minutes, and an alert that arrives 288 times a day is one people filter out.
 * The flag is cleared when a new token is saved, so the *next* failure alerts
 * again.
 *
 * Never throws. It is called from the poll and from the sync, and neither
 * should fail because SMTP did.
 */
export const alertTokenInvalid = async (account, errorMessage) => {
  try {
    if (!env.meta.alertEmail) return { sent: false, reason: "no_alert_email" };

    const last = account.alertedAt ? new Date(account.alertedAt).getTime() : 0;

    if (last && Date.now() - last < META_ALERT_DEBOUNCE_MS) {
      return { sent: false, reason: "debounced" };
    }

    const html = buildEmail({
      header: HEADERS.GRADIENT,
      body: BODIES.META_TOKEN_EXPIRED({
        accountName: account.name,
        pageId: account.pageId,
        errorMessage,
        settingsUrl: `${env.adminSiteUrl.replace(/\/$/, "")}/integrations/facebook`,
      }),
      // Transactional footer, not the marketing one: this is an operational
      // alert to a staff address and there is nothing to unsubscribe from.
      footer: FOOTERS.GRADIENT,
    });

    const result = await sendMail({
      fromEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
      to: env.meta.alertEmail,
      subject: `Facebook lead import stopped — ${account.name}`,
      html,
      text:
        `The access token for ${account.name} (Page ${account.pageId}) is no longer valid ` +
        `and Gradient has stopped importing its leads.\n\n${errorMessage}`,
    });

    // `sendMail` resolves rather than throws, so a failure is a value to check.
    if (!result?.success) {
      logger.error("Meta token alert could not be sent", {
        accountId: account.id,
        error: result?.error,
      });
      return { sent: false, reason: "send_failed" };
    }

    // Stamped only on a successful send, so a mail outage does not silently
    // consume the one alert this failure was going to get.
    account.alertedAt = new Date();
    await account.save();

    logger.info("Meta token alert sent", {
      accountId: account.id,
      to: env.meta.alertEmail,
    });

    return { sent: true };
  } catch (error) {
    logger.error("Meta token alert threw", {
      accountId: account?.id,
      error: error.message,
    });
    return { sent: false, reason: "threw" };
  }
};

export default { alertTokenInvalid };
