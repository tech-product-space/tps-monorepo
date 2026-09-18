const axios = require("axios");

async function sendMetaOtp(phone, otp, options = {}) {
  const { templateName = "otp_verification", language = "en_US" } = options;

  const accessToken = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error("Meta WhatsApp credentials missing");
  }

  phone = phone.replace(/\D/g, "");

  const response = await axios.post(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: otp }],
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  return response.data;
}

module.exports = sendMetaOtp;
