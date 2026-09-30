const axios = require("axios");

async function sendGallaboxOtp(phone, otp, options = {}) {
  const {
    templateName = "otp_verification",
    recipientName = "User",
  } = options;

  const apiKey = process.env.GALLABOX_API_KEY;
  const apiSecret = process.env.GALLABOX_API_SECRET;
  const channelId = process.env.GALLABOX_CHANNEL_ID;

  if (!apiKey || !apiSecret || !channelId) {
    throw new Error("Gallabox credentials missing");
  }

  phone = phone.replace(/\D/g, "");

  const response = await axios.post(
    "https://server.gallabox.com/devapi/messages/whatsapp",
    {
      channelId,
      channelType: "whatsapp",
      recipient: {
        name: recipientName,
        phone,
      },
      whatsapp: {
        type: "template",
        template: {
          templateName,
          bodyValues: {
            otp,
          },
        },
      },
    },
    {
      headers: {
        apikey: apiKey,
        apiSecret: apiSecret,
        "Content-Type": "application/json",
      },
    },
  );

  return response.data;
}

module.exports = sendGallaboxOtp;
