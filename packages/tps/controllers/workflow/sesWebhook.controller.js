"use strict";

const psEnv = require("@ps/env/tps");
const axios = require("axios");
const crypto = require("crypto");

const { LeadConsent, LeadEvent } = require("../../models");
const { recordLeadEvent } = require("../../service/workflow/events/recordLeadEvent");
const { LEAD_EVENT_TYPE } = require("../../constants/workflow");
const { updateStatusOnWebhook } = require("../../service/mail/sesLogger");

// SNS HTTP(S) endpoint receives JSON with Type=SubscriptionConfirmation |
// Notification | UnsubscribeConfirmation. The Type comes via header or body.
// We accept text/plain payloads from SNS by parsing manually.
async function parseBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body || null;
}

// SNS message signature verification — fetch the SigningCertURL and verify
// the HMAC. Best-effort; configurable via SES_WEBHOOK_VERIFY_SIGNATURE=false
// for local development.
async function verifySnsMessage(msg) {
  if (psEnv.SES_WEBHOOK_VERIFY_SIGNATURE === "false") return true;
  if (!msg || !msg.SignatureVersion || !msg.SigningCertURL || !msg.Signature) {
    return false;
  }
  if (!/^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//i.test(msg.SigningCertURL)) {
    return false;
  }
  try {
    const { data: cert } = await axios.get(msg.SigningCertURL, { responseType: "text" });
    const stringToSign = buildSnsStringToSign(msg);
    const verifier = crypto.createVerify("RSA-SHA1");
    verifier.update(stringToSign, "utf8");
    return verifier.verify(cert, msg.Signature, "base64");
  } catch (err) {
    console.error("SNS signature verify error:", err.message);
    return false;
  }
}

function buildSnsStringToSign(msg) {
  const fields =
    msg.Type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  let s = "";
  for (const f of fields) {
    if (msg[f] !== undefined && msg[f] !== null) {
      s += `${f}\n${msg[f]}\n`;
    }
  }
  return s;
}

function extractMsgId(mail) {
  if (!mail) return null;
  if (Array.isArray(mail.tags?.ps_msg_id) && mail.tags.ps_msg_id[0]) {
    return mail.tags.ps_msg_id[0];
  }
  if (Array.isArray(mail.headers)) {
    const h = mail.headers.find((x) => /^x-ps-msg-id$/i.test(x?.name));
    if (h?.value) return h.value;
  }
  return null;
}

async function locateLead(messageId) {
  if (!messageId) return null;
  const ev = await LeadEvent.findOne({
    where: {
      provider_message_id: messageId,
      event_type: LEAD_EVENT_TYPE.EMAIL_SENT,
    },
  });
  if (!ev) return null;
  return {
    leadSourceType: ev.lead_source_type,
    leadSourceId: ev.lead_source_id,
    enrollmentId: ev.enrollment_id,
    workflowNodeRunId: ev.workflow_node_run_id,
  };
}

async function applyOptOut(leadSourceType, leadSourceId, reason) {
  if (!leadSourceType || !leadSourceId) return;
  const [row, created] = await LeadConsent.findOrCreate({
    where: { lead_source_type: leadSourceType, lead_source_id: leadSourceId },
    defaults: {
      lead_source_type: leadSourceType,
      lead_source_id: leadSourceId,
      opt_out_email: true,
      opt_out_email_at: new Date(),
      opt_out_email_reason: reason,
    },
  });
  if (!created && !row.opt_out_email) {
    await row.update({
      opt_out_email: true,
      opt_out_email_at: new Date(),
      opt_out_email_reason: reason,
    });
  }
}

exports.sesNotification = async (req, res) => {
  // Acknowledge fast — SNS retries on non-2xx for a long time.
  res.status(200).json({ ok: true });

  try {
    const env = await parseBody(req);
    if (!env) return;

    if (env.Type === "SubscriptionConfirmation" && env.SubscribeURL) {
      if (await verifySnsMessage(env)) {
        await axios.get(env.SubscribeURL);
        console.log("[ses] SNS subscription confirmed");
      } else {
        console.warn("[ses] SubscriptionConfirmation signature invalid; skipping confirm");
      }
      return;
    }

    if (env.Type !== "Notification") return;
    if (!(await verifySnsMessage(env))) {
      console.warn("[ses] SNS signature invalid; dropping notification");
      return;
    }

    let inner;
    try { inner = JSON.parse(env.Message); } catch { return; }
    if (!inner || typeof inner !== "object") return;

    const messageId = extractMsgId(inner.mail);
    const sesNativeId = inner.mail?.messageId || null;
    const kind = inner.notificationType || inner.eventType;

    if (kind === "Bounce") {
      updateStatusOnWebhook({
        correlationId: messageId,
        messageId: sesNativeId,
        status: "BOUNCED",
        errorMessage: `${inner.bounce?.bounceType || "Bounce"} (${inner.bounce?.bounceSubType || "Unknown"})`,
      }).catch(() => {});
    } else if (kind === "Complaint") {
      updateStatusOnWebhook({
        correlationId: messageId,
        messageId: sesNativeId,
        status: "COMPLAINT",
        errorMessage: inner.complaint?.complaintFeedbackType || "Spam complaint",
      }).catch(() => {});
    }

    if (!messageId) return;
    const lead = await locateLead(messageId);
    if (!lead) return;
    const occurredAt = inner.mail?.timestamp ? new Date(inner.mail.timestamp) : new Date();

    if (kind === "Bounce") {
      const bounceType = inner.bounce?.bounceType;
      const isPermanent = bounceType === "Permanent";
      await recordLeadEvent({
        ...lead,
        eventType: LEAD_EVENT_TYPE.EMAIL_BOUNCED,
        occurredAt,
        providerMessageId: messageId,
        payload: {
          bounceType,
          bounceSubType: inner.bounce?.bounceSubType,
          recipients: inner.bounce?.bouncedRecipients,
        },
        dedupeKey: `bounce:${messageId}`,
      });
      if (isPermanent) {
        await applyOptOut(lead.leadSourceType, lead.leadSourceId, "hard_bounce");
      }
    } else if (kind === "Complaint") {
      await recordLeadEvent({
        ...lead,
        eventType: LEAD_EVENT_TYPE.EMAIL_COMPLAINED,
        occurredAt,
        providerMessageId: messageId,
        payload: {
          complaintFeedbackType: inner.complaint?.complaintFeedbackType,
          recipients: inner.complaint?.complainedRecipients,
        },
        dedupeKey: `complaint:${messageId}`,
      });
      await applyOptOut(lead.leadSourceType, lead.leadSourceId, "spam_complaint");
    }
  } catch (err) {
    console.error("SES SNS notification handler failed:", err.message);
  }
};
