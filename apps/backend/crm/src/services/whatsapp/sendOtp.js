const sendMetaOtp = require("./provider/metaProvider");
const sendGallaboxOtp = require("./provider/gallaboxProvider");

/**
 * WhatsApp OTP delivery, ported from tps-next-backend/service/whatsapp/sendOtp.js.
 *
 * Both systems send through the same WABA and the same `otp_verification`
 * template, so a student who has verified on the public site sees the same
 * message here.
 */

const WHATSAPP_PROVIDER = Object.freeze({
  META: "meta",
  GALLABOX: "gallabox",
});

const DEFAULT_PROVIDER =
  process.env.DEFAULT_WHATSAPP_PROVIDER || WHATSAPP_PROVIDER.META;

/**
 * @param {string} phone Digits only, country code included
 * @param {string} otp   The code, in the clear — never log the return of this
 */
async function sendOtp(phone, otp, options = {}) {
  const { provider = DEFAULT_PROVIDER } = options;

  if (provider === WHATSAPP_PROVIDER.META) {
    return sendMetaOtp(phone, otp, options);
  }

  if (provider === WHATSAPP_PROVIDER.GALLABOX) {
    return sendGallaboxOtp(phone, otp, options);
  }

  throw new Error(`Unsupported WhatsApp provider: ${provider}`);
}

module.exports = sendOtp;
module.exports.WHATSAPP_PROVIDER = WHATSAPP_PROVIDER;
