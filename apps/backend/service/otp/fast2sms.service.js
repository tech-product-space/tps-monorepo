const axios = require("axios");

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2";

const NON_RETRYABLE_CODES = new Set([
  411, // Invalid Numbers
  406, // Invalid Sender ID
  408, // Invalid Route
  412, // Invalid Authentication
  413, // Auth Disabled
  416, // Insufficient balance
  424, // Invalid Message ID
  425, // Invalid Template
  426, // Invalid Link
  500, // Blacklisted at DLT
  995, // Spamming detected
  996, // OTP route needs KYC
  997, // Non-numeric variables
  990, // Old API
]);

async function sendOtpSms(phone, otp, options = {}) {
  const {
    messageOverride = "",
    retries = 3,
    backoffMs = 1000,
    onSuccess,
    onRetry,
    onNonRetryableError,
    onFailure,
  } = options;

  if (!FAST2SMS_API_KEY) {
    onNonRetryableError?.(new Error("FAST2SMS_API_KEY not configured"));
    return;
  }

  const otpMode = process.env.OTP_MODE || "live";
  if (otpMode === "off") {
    console.log("[OTP] Disabled. Skipping SMS.", { phone, otp });
    onSuccess?.({ skipped: true, mode: "off" });
    return;
  }

  const payload = otpMode === "test"
    ? {
        route: "q",
        numbers: phone,
        message: messageOverride || `Your OTP is ${otp}. Valid for 10 minutes.`,
      }
    : {
        route: "otp",
        numbers: phone,
        variables_values: otp,
      };

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(FAST2SMS_URL, payload, {
        headers: {
          authorization: FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      const data = response.data || {};

      if (data.return === true) {
        onSuccess?.(data);
        return;
      }

      const code = data.status_code;

      if (NON_RETRYABLE_CODES.has(code)) {
        const err = new Error(data.message || "Permanent SMS failure");
        err.code = code;

        onNonRetryableError?.(err, data);
        return;
      }

      throw new Error(data.message || "Retryable SMS failure");
    } catch (err) {
      lastError = err;

      if (attempt < retries) {
        onRetry?.(err, attempt);
        await new Promise((r) => setTimeout(r, backoffMs * attempt));
      }
    }
  }

  onFailure?.(lastError);
}

module.exports = {
  sendOtpSms,
};
