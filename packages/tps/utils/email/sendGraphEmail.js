const psEnv = require("@ps/env/tps");
const axios = require("axios");
const { getAccessToken } = require("./authProvider");
require("dotenv").config();

// `id` is our correlation id (uuid). Threaded into the outgoing mail via a
// custom `x-ps-msg-id` internet message header. Graph's /sendMail does not
// return a message id, so the caller treats the supplied `id` as the
// provider-correlation token.
const sendGraphEmail = async ({ to, subject, html, fromName, headers, id }) => {
  const accessToken = await getAccessToken();

  const message = {
    subject,
    body: { contentType: "html", content: html },
    toRecipients: [{ emailAddress: { address: to } }],
  };

  if (fromName) {
    message.from = {
      emailAddress: { name: fromName, address: psEnv.EMAIL_OUTLOOK_USER },
    };
  }

  const allHeaders = [];
  if (id) allHeaders.push({ name: "x-ps-msg-id", value: id });
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h?.name && h?.value) allHeaders.push({ name: h.name, value: h.value });
    }
  }
  if (allHeaders.length) message.internetMessageHeaders = allHeaders;

  try {
    await axios.post(
      `https://graph.microsoft.com/v1.0/users/${psEnv.EMAIL_OUTLOOK_USER}/sendMail`,
      { message },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    return { providerMessageId: id || null };
  } catch (err) {
    console.error(
      "❌ Failed to send via Graph:",
      err.response?.data || err.message,
    );
    throw err;
  }
};

module.exports = { sendGraphEmail };
