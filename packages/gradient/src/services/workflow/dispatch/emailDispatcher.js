import {
  BODIES,
  FOOTERS,
  HEADERS,
  buildEmail,
  sendMail,
} from "../../email/index.js";
import { isSuppressed } from "../../subscriber/suppression.service.js";
import { buildUnsubscribeUrl } from "../../subscriber/unsubscribeToken.js";
import { appendCampaignUtm } from "../../campaign/appendCampaignUtm.js";
import { recordLeadEvent } from "../../leadEvent/recordLeadEvent.service.js";
import { LEAD_EVENT_TYPE, LEAD_EVENT_SOURCE_TYPE } from "../../../config/constants/leadEvent.js";
import capitalizeName from "../../../util/helpers/capitalizeName.js";
import logger from "../../../util/logger.js";

/**
 * Composes and sends one workflow email.
 *
 * Everything channel-specific lives here so the `sendEmail` node stays control
 * flow — the seam an SMS or WhatsApp step would need is already cut.
 *
 * **Workflow email is marketing.** It carries `FOOTERS.GRADIENT_MARKETING`
 * with a working unsubscribe link, and it is checked against the suppression
 * list immediately before every send. That second check matters more here than
 * in a campaign: days can pass between enrolling somebody and mailing them, and
 * a journey must not keep mailing someone who left partway through it.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §6.4 and §8.2.
 *
 * @returns {Promise<{outcome: "sent"|"suppressed"|"noRecipient"|"failed",
 *                    providerMessageId?: string, error?: string, retryable?: boolean}>}
 */
export const dispatchWorkflowEmail = async ({
  to,
  name,
  config,
  workflow,
  enrollment,
  nodeRun,
}) => {
  if (!to) return { outcome: "noRecipient" };

  if (await isSuppressed(to)) {
    logger.info("Workflow email suppressed", {
      workflowId: workflow?.id,
      enrollmentId: enrollment?.id,
    });
    return { outcome: "suppressed" };
  }

  const { subject, html } = composeWorkflowEmail({
    config,
    workflow,
    recipient: { email: to, name },
  });

  const result = await sendMail({
    fromEmail: config.senderEmail,
    fromName: config.senderName || undefined,
    replyTo: config.replyTo || undefined,
    to,
    subject,
    html,
  });

  // `sendMail` resolves rather than throws. Treating a rejection as the only
  // failure mode would mark every failed send as sent.
  if (!result.success) {
    return {
      outcome: "failed",
      error: result.error || "Send failed",
      // Transport, as far as we can tell from here — worth a retry. A config
      // problem such as an unverified sender fails all three attempts and
      // lands on the enrolment with the provider's own wording, which is more
      // useful than a guess made here.
      retryable: true,
    };
  }

  /**
   * The send goes onto the activity stream.
   *
   * This is what closes the loop for branch conditions in phase 5: with the
   * send and the outcome in one table, "did they register **after** we emailed
   * them" is a single query over `lead_events`.
   */
  await recordLeadEvent({
    email: to,
    eventType: LEAD_EVENT_TYPE.EMAIL_SENT,
    sourceType: LEAD_EVENT_SOURCE_TYPE.WORKFLOWS,
    sourceId: workflow?.id ?? null,
    metadata: {
      workflowId: workflow?.id ?? null,
      nodeId: nodeRun?.nodeId ?? null,
      subject: config.subject,
    },
    enrollmentId: enrollment?.id ?? null,
    nodeRunId: nodeRun?.id ?? null,
    // One node run is one send, so the run id is the natural key — a
    // redelivered job that gets as far as here writes no second event.
    dedupeKey: nodeRun?.id ? `email.sent:${nodeRun.id}` : null,
  });

  return {
    outcome: "sent",
    providerMessageId: result.messageId ?? null,
  };
};

/**
 * Exported so the send-test endpoint uses the identical path — what an admin
 * previews is byte-for-byte what ships, including the UTM rewrite and the
 * unsubscribe footer. The campaign editor learned this the same way.
 */
export const composeWorkflowEmail = ({ config, workflow, recipient }) => {
  const name = capitalizeName(recipient.name || "there");

  const unsubscribeUrl = buildUnsubscribeUrl(recipient.email, workflow?.id ?? null);

  /**
   * UTM first, then the footer.
   *
   * The unsubscribe link is added afterwards and must not be rewritten. Getting
   * this order wrong puts campaign tracking parameters on somebody's opt-out,
   * which at best looks careless and at worst breaks the link.
   *
   * `utm_campaign` becomes the workflow id, so
   * `SELECT count(*) FROM leads WHERE "utmCampaign" = :workflowId` answers what
   * an automation actually produced — in leads, not in opens.
   */
  const trackedBody = appendCampaignUtm(config.body, workflow?.id ?? null);

  return {
    subject: BODIES.CUSTOM(config.subject, { name }),
    html: buildEmail({
      header: HEADERS.GRADIENT,
      body: BODIES.CUSTOM(trackedBody, { name }),
      // Mandatory on every workflow email, with no per-workflow exemption.
      footer: FOOTERS.GRADIENT_MARKETING,
      footerProps: { unsubscribeUrl },
    }),
  };
};
