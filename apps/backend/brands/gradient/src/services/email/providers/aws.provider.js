import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";

export const createAwsSesTransport = ({
  region,
  accessKeyId,
  secretAccessKey,
  user,
}) => {
  const ses = new SESClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  function buildRawEmail({ from, to, subject, html, text, attachments = [] }) {
    const boundary = "NextPart_" + Date.now();
    const recipients = Array.isArray(to) ? to.join(",") : to;

    let body = `From: ${from}
To: ${recipients}
Subject: ${subject}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: ${html ? "text/html" : "text/plain"}; charset="UTF-8"

${html || text}
`;

    for (const att of attachments) {
      body += `
--${boundary}
Content-Type: ${att.contentType}; name="${att.filename}"
Content-Disposition: attachment; filename="${att.filename}"
Content-Transfer-Encoding: base64

${att.content.toString("base64")}
`;
    }

    body += `--${boundary}--`;

    return Buffer.from(body);
  }

  return {
    async sendMail({ to, subject, html, text, attachments = [], fromName }) {

      const rawEmail = buildRawEmail({
        from: `${fromName} <${user}>` || user,
        to,
        subject,
        html,
        text,
        attachments,
      });

      const command = new SendRawEmailCommand({
        RawMessage: {
          Data: rawEmail,
        },
      });

      const result = await ses.send(command);

      // The MessageId is the only key that ties a later delivery, bounce,
      // complaint, open or click notification back to the row we just mailed.
      // It used to be discarded here (`return true`), which made every one of
      // those events uncorrelatable. Stored per recipient — see plan §9.1.
      return { messageId: result?.MessageId ?? null };
    },
  };
};