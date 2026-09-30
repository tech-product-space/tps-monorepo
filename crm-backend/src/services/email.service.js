const axios = require("axios");

/* ─── Token cache ───────────────────────────────────────── */
let _cachedToken = null;
let _tokenExpiresAt = 0;

/* ─── Get Access Token (Client Credentials) ─────────────── */
async function getAccessToken() {
  const now = Date.now();

  if (_cachedToken && now < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const {
    OUTLOOK_CLIENT_ID,
    OUTLOOK_CLIENT_SECRET,
    OUTLOOK_TENANT_ID,
  } = process.env;

  if (!OUTLOOK_CLIENT_ID || !OUTLOOK_CLIENT_SECRET || !OUTLOOK_TENANT_ID) {
    throw new Error("Missing Outlook OAuth env variables");
  }

  const tokenUrl = `https://login.microsoftonline.com/${OUTLOOK_TENANT_ID}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: OUTLOOK_CLIENT_ID,
    client_secret: OUTLOOK_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await axios.post(tokenUrl, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const data = res.data;

  _cachedToken = data.access_token;
  _tokenExpiresAt = now + (data.expires_in ?? 3600) * 1000;

  return _cachedToken;
}

/* ─── Send Email via Microsoft Graph ────────────────────── */

/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.replyTo]
 * @param {string[]} [opts.bcc] - Addresses blind-copied on the message (hidden from the recipient)
 * @param {Array<{filename:string, content:Buffer, contentType:string}>} [opts.attachments]
 */
async function sendEmail({ to, subject, html, replyTo, bcc, attachments }) {
  const accessToken = await getAccessToken();

  const sender = process.env.OUTLOOK_SENDER_EMAIL;

  if (!sender) {
    throw new Error("Missing OUTLOOK_SENDER_EMAIL");
  }

  const message = {
    subject,
    body: {
      contentType: "HTML",
      content: html,
    },
    toRecipients: [
      {
        emailAddress: {
          address: to,
        },
      },
    ],
  };

  if (bcc && bcc.length > 0) {
    message.bccRecipients = bcc.map((address) => ({
      emailAddress: { address },
    }));
  }

  if (replyTo) {
    message.replyTo = [
      {
        emailAddress: {
          address: replyTo,
        },
      },
    ];
  }

  // optional sender name branding
  message.from = {
    emailAddress: {
      address: sender,
      name: "ProductSpace",
    },
  };

  // Attach PDF files (Base64-encoded for Graph API)
  if (attachments && attachments.length > 0) {
    message.attachments = attachments.map((att) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: att.filename,
      contentType: att.contentType || "application/octet-stream",
      contentBytes: Buffer.isBuffer(att.content)
        ? att.content.toString("base64")
        : Buffer.from(att.content).toString("base64"),
    }));
  }

  try {
    await axios.post(
      `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`,
      { message },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return { success: true };
  } catch (err) {
    console.error(
      "❌ Graph email error:",
      err.response?.data || err.message
    );
    throw new Error("Failed to send email");
  }
}

module.exports = { sendEmail };