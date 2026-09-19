const psEnv = require("@ps/env/tps");
const sendMetaOtp = require("./provider/metaProvider");
const sendGallaboxOtp = require("./provider/gallaboxProvider");
const { WHATSAPP_PROVIDER } = require("../../constants/whatsapp");

const DEFAULT_PROVIDER = psEnv.DEFAULT_WHATSAPP_PROVIDER || WHATSAPP_PROVIDER.META; 

async function sendOtp(phone, otp, options = {}) {
  const { provider = DEFAULT_PROVIDER } = options;

  if (provider === WHATSAPP_PROVIDER.META) {
    return sendMetaOtp(phone, otp, options);
  }

  if (provider === WHATSAPP_PROVIDER.GALLABOX) {
    return sendGallaboxOtp(phone, otp, options);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

module.exports = sendOtp;