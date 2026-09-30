require("dotenv").config();

const { SendEmailCommand } = require("@aws-sdk/client-ses");
const sesClient = require("../../config/sesClient");

const { recordSesLog } = require("../../service/mail/sesLogger");

async function sendGradientAwsMail({ to, subject, html, fromName, from, headers, id, meta, ...rest }) {
  const senderEmail = (from || process.env.AWS_SES_GRADIENT_FROM_MAIL || "noreply@gradientlearnings.org").trim();
  const displayName = fromName || "Gradient Learnings";

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
      meta: meta || { source: "OTHER", sourceName: "Gradient SES Dispatch" },
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
      meta: meta || { source: "OTHER", sourceName: "Gradient SES Dispatch" },
    });

    throw error;
  }
}

module.exports = sendGradientAwsMail;
