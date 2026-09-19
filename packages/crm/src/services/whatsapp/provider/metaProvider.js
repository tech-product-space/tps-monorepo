const psEnv = require("@ps/env/crm");
const axios = require("axios");

/**
 * Meta WhatsApp Cloud API template send.
 *
 * Ported from tps-next-backend/service/whatsapp/provider/metaProvider.js. The
 * `otp_verification` template is already approved on the WABA and takes one
 * body parameter — the code. Do not change the template name here without
 * changing it on Meta first; an unapproved name fails the send silently from
 * the student's point of view.
 */
async function sendMetaOtp(phone, otp, options = {}) {
  const { templateName = "otp_verification", language = "en_US" } = options;

  const accessToken = psEnv.META_WHATSAPP_TOKEN;
  const phoneNumberId = psEnv.META_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error("Meta WhatsApp credentials missing");
  }

  phone = String(phone).replace(/\D/g, "");

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
      timeout: 15000,
    },
  );

  return response.data;
}

module.exports = sendMetaOtp;
