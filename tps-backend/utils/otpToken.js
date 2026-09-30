const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const OTP_TOKEN_EXPIRES_IN = "5m";

/**
 * Generate OTP token
 *
 * @param {String} otpId - Mongo OTP document ID
 * @param {Object} data - Optional contextual data (leadId, userId, purpose, etc.)
 */
function generateOtpToken({ otpId, data = {}, expiry = OTP_TOKEN_EXPIRES_IN }) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      otpId,
      data,
      purpose: "otp",
    },
    JWT_SECRET,
    {
      expiresIn: expiry,
    }
  );
}

/**
 * Verify OTP token
 */
function verifyOtpToken(token) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const payload = jwt.verify(token, JWT_SECRET);

  if (payload.purpose !== "otp") {
    throw new Error("Invalid OTP token");
  }

  return payload;
}

module.exports = {
  generateOtpToken,
  verifyOtpToken,
};
