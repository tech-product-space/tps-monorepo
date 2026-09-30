import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { recordSesDispatchLog } from "../emailDispatchLogger.service.js";

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
    async sendMail({
      to,
      subject,
      html,
      text,
      attachments = [],
      fromName,
      source,
      correlationId,
      metadata = {},
    }) {
      const fromFormatted = fromName ? `${fromName} <${user}>` : user;

      const rawEmail = buildRawEmail({
        from: fromFormatted,
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

      try {
        const result = await ses.send(command);
        const messageId = result?.MessageId ?? null;

        // Guaranteed driver-level SES logging on success
        await recordSesDispatchLog({
          provider: "aws",
          source,
          correlationId,
          to,
          from: user,
          fromName,
          subject,
          html,
          text,
          attachments,
          status: "SENT",
          messageId,
          metadata,
        });

        return { messageId };
      } catch (sendErr) {
        // Guaranteed driver-level SES logging on failure
        await recordSesDispatchLog({
          provider: "aws",
          source,
          correlationId,
          to,
          from: user,
          fromName,
          subject,
          html,
          text,
          attachments,
          status: "FAILED",
          error: sendErr?.message || String(sendErr),
          metadata,
        });

        throw sendErr;
      }
    },
  };
};