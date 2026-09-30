require("dotenv").config();

const { SendEmailCommand } = require("@aws-sdk/client-ses");
const sesClient = require("../../config/sesClient");

const { recordSesLog } = require("../../service/mail/sesLogger");

// `id` is our correlation id (uuid). Threaded via SES Tags so SNS
// bounce/complaint notifications can map back to a workflow_node_run.
async function sendAwsMail({ to, subject, html, fromName, from, headers, id, meta, ...rest }) {
  const senderEmail = (from || process.env.AWS_SES_FROM_MAIL || "noreply@theproductspace.in").trim();
  const displayName = fromName || "Product Space";

  const params = {
    Source: `${displayName} <${senderEmail}>`,
    Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
    Message: {
      Subject: { Data: subject || "", Charset: "UTF-8" },
      Body: { Html: { Data: html || "", Charset: "UTF-8" } },
    },
  };

  if (id) {
    params.Tags = [{ Name: "ps_msg_id", Value: id }];
  }

  try {
    const command = new SendEmailCommand(params);
    const res = await sesClient.send(command);
    const providerMessageId = res?.MessageId || null;

    // Guaranteed driver-level logging on successful SES dispatch
    await recordSesLog({
      to,
      subject,
      html,
      from: senderEmail,
      fromName: displayName,
      id,
      providerMessageId,
      status: "SENT",
      meta: meta || { source: "OTHER", sourceName: "SES Dispatch" },
    });

    return { providerMessageId };
  } catch (error) {
    // Guaranteed driver-level logging on failed SES dispatch
    await recordSesLog({
      to,
      subject,
      html,
      from: senderEmail,
      fromName: displayName,
      id,
      status: "FAILED",
      errorMessage: error?.message || String(error),
      meta: meta || { source: "OTHER", sourceName: "SES Dispatch" },
    });

    throw error;
  }
}

module.exports = sendAwsMail;
