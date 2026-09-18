import {
  WORKFLOW_NODE_TYPE,
  WORKFLOW_END_REASON,
} from "../../../config/constants/workflow.js";

/**
 * Send one email, then move on.
 *
 * The dispatcher owns composition, suppression and the `email.sent` event
 * (`dispatch/emailDispatcher.js`); this handler is control flow and nothing
 * else. That split is what makes adding an SMS or WhatsApp step later a new
 * dispatcher rather than a redesign.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §6.2–6.4.
 */

export const type = WORKFLOW_NODE_TYPE.SEND_EMAIL;

export const label = "Send email";

/**
 * Validated at publish, never at save — a half-built draft is allowed to be
 * invalid, and the editor would be unusable if it were not.
 */
export const configSchema = {
  subject: { type: "string", required: true, maxLength: 300 },
  body: { type: "string", required: true },
  senderEmail: { type: "string", required: true },
  senderName: { type: "string", required: false, maxLength: 120 },
  replyTo: { type: "string", required: false },
};

/**
 * @param {object} ctx
 * @param {object} ctx.enrollment
 * @param {object} ctx.node        `{ id, type, config }` from the frozen version
 * @param {object} ctx.workflow
 * @param {object} ctx.nodeRun
 * @returns {Promise<{outcome: string, providerMessageId?: string, output?: object, reason?: string}>}
 */
export const execute = async ({ enrollment, node, workflow, nodeRun }) => {
  /**
   * Has this step already gone out to this person?
   *
   * The partial unique index on `(enrollmentId, nodeId)` over non-failed rows
   * stops two jobs claiming this step at once, but a row that *failed* leaves
   * that index so the step can be retried — and a step that really failed must
   * be. That leaves one window: the process dies after SES accepts
   * the message but before the run row records it, and the retry sends again.
   *
   * A provider message id on a completed run for this node is proof the send
   * happened, so this reads it and moves on instead. Checked here rather than
   * in `advanceEnrollment` because it is specific to the one node type with an
   * irreversible side effect — a `wait` and a `branch` are *supposed* to run
   * more than once.
   */
  const { default: db } = await import(
    "../../../database/postgres/models/index.js"
  );

  const alreadySent = await db.WorkflowNodeRun.findOne({
    where: {
      enrollmentId: enrollment.id,
      nodeId: node.id,
      // Deliberately not filtered on `status: "completed"`. The dangerous row
      // is the one that carries a message id and is *not* completed — a send
      // that SES accepted and that then failed on the way to being recorded.
      // That row is marked `failed`, which releases the step for a retry, and
      // the retry is exactly the send that must not happen twice. A provider
      // message id is proof the email left, whatever the row's status says.
      providerMessageId: { [db.Sequelize.Op.ne]: null },
    },
    order: [["startedAt", "DESC"]],
  });

  if (alreadySent) {
    return {
      outcome: "next",
      providerMessageId: alreadySent.providerMessageId,
      // Named, so the enrolment timeline says "we did not send this twice"
      // rather than showing a second send that never happened.
      output: {
        alreadySent: true,
        firstSentAt: alreadySent.finishedAt ?? alreadySent.startedAt,
      },
    };
  }

  const { dispatchWorkflowEmail } = await import(
    "../dispatch/emailDispatcher.js"
  );

  const result = await dispatchWorkflowEmail({
    to: enrollment.email,
    name: enrollment.name,
    config: node.config,
    workflow,
    enrollment,
    nodeRun,
  });

  switch (result.outcome) {
    case "sent":
      return {
        outcome: "next",
        providerMessageId: result.providerMessageId,
        output: { sentTo: enrollment.email },
      };

    /**
     * Ends the journey rather than skipping the step.
     *
     * Suppressing the send but leaving the person enrolled means each of the
     * next four emails is checked, skipped and logged — invisible, correct,
     * and pointless. §8.2.
     */
    case "suppressed":
      return {
        outcome: "stop",
        reason: WORKFLOW_END_REASON.OPTED_OUT,
        output: { suppressed: true },
      };

    case "noRecipient":
      return {
        outcome: "stop",
        reason: WORKFLOW_END_REASON.ERROR + ":no email address",
        output: {},
      };

    default:
      // A transport failure. Thrown retryable so BullMQ's backoff gets a second
      // go at an SES timeout — the dispatcher is what decides this is transport
      // and not, say, an unverified sender.
      return {
        outcome: "fail",
        retryable: result.retryable !== false,
        reason: result.error || "Send failed",
      };
  }
};
