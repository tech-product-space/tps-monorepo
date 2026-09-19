const psEnv = require("@ps/env/tps");
require("dotenv").config();

const { SendEmailCommand } = require("@aws-sdk/client-ses");
const sesClient = require("../../config/sesClient");

// `id` is our correlation id (uuid). Threaded via SES Tags so SNS
// bounce/complaint notifications can map back to a workflow_node_run.
async function sendAwsMail({ to, subject, html, fromName, headers, id, ...rest }) {
  const params = {
    Source: `${fromName || "Product Space"} <${psEnv.AWS_SES_FROM_MAIL}>`,
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

module.exports = sendAwsMail;
