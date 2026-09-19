const psEnv = require("@ps/env/crm");
const axios = require("axios");

/**
 * Gallabox WhatsApp template send — the fallback provider.
 *
 * Ported from tps-next-backend/service/whatsapp/provider/gallaboxProvider.js.
 * Selected by DEFAULT_WHATSAPP_PROVIDER=gallabox, or per-call via
 * sendOtp(phone, otp, { provider }).
 */
async function sendGallaboxOtp(phone, otp, options = {}) {
  const { templateName = "otp_verification", recipientName = "User" } = options;

  const apiKey = psEnv.GALLABOX_API_KEY;
  const apiSecret = psEnv.GALLABOX_API_SECRET;
  const channelId = psEnv.GALLABOX_CHANNEL_ID;

  if (!apiKey || !apiSecret || !channelId) {
    throw new Error("Gallabox credentials missing");
  }

  phone = String(phone).replace(/\D/g, "");

  const response = await axios.post(
    "https://server.gallabox.com/devapi/messages/whatsapp",
    {
      channelId,
      channelType: "whatsapp",
      recipient: { name: recipientName, phone },
      whatsapp: {
        type: "template",
        template: {
          templateName,
          bodyValues: { otp },
        },
      },
    },
    {
      headers: {
        apikey: apiKey,
        apiSecret: apiSecret,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    },
  );

  return response.data;
}

module.exports = sendGallaboxOtp;
