import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { verifyUnsubscribeToken } from "../../services/subscriber/unsubscribeToken.js";
import { suppress } from "../../services/subscriber/suppression.service.js";

/**
 * Public unsubscribe flow. Both routes are unauthenticated by necessity — the
 * only thing the visitor has is the signed token from their email footer.
 */

/**
 * VERIFY UNSUBSCRIBE TOKEN
 *
 * Lets the page name the address it is about to unsubscribe, rather than
 * asking someone to retype the address they were just emailed at.
 *
 * Returns the email in full. That is a deliberate choice and worth stating: the
 * token already encodes it and only reaches the person we emailed, so masking
 * it would protect nothing and leave the visitor unsure which of their
 * addresses they are removing.
 */
export const verifyUnsubscribeLink = asyncWrapper(async (req, res) => {
  const { token } = req.query;

  const payload = verifyUnsubscribeToken(token);

  if (!payload) {
    return res.status(400).json({
      message: "This unsubscribe link is not valid.",
    });
  }

  return res.status(200).json({
    data: {
      email: payload.email,
    },
  });
});

/**
 * UNSUBSCRIBE
 *
 * Idempotent — a double-clicked link, or a second visit to a bookmarked page,
 * refreshes the metadata and reports success rather than erroring. Someone
 * confirming they are still unsubscribed should never see a failure.
 */
export const unsubscribe = asyncWrapper(async (req, res) => {
  const { token, reason } = req.body;

  const payload = verifyUnsubscribeToken(token);

  if (!payload) {
    return res.status(400).json({
      message: "This unsubscribe link is not valid.",
    });
  }

  await suppress({
    email: payload.email,
    // Free text from the page. Capped here rather than trusted: this is an
    // unauthenticated write and the column is TEXT.
    reason: typeof reason === "string" ? reason.trim().slice(0, 1000) : null,
    campaignId: payload.campaignId,
  });

  return res.status(200).json({
    message: "You have been unsubscribed from marketing emails.",
    data: {
      email: payload.email,
    },
  });
});
