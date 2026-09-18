require("dotenv").config();

const { SendEmailCommand } = require("@aws-sdk/client-ses");
const sesClient = require("../../config/sesClient");

async function sendGradientAwsMail({ to, subject, html, fromName, headers, id, ...rest }) {
  const params = {
    Source: `${fromName || "Gradient Learnings"} <${process.env.AWS_SES_GRADIENT_FROM_MAIL}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: { Html: { Data: html, Charset: "UTF-8" } },
    },
  };

  if (id) {
    params.Tags = [{ Name: "ps_msg_id", Value: id }];
  }

  const command = new SendEmailCommand(params);
  const res = await sesClient.send(command);
  return { providerMessageId: res?.MessageId || null };
}

module.exports = sendGradientAwsMail;
