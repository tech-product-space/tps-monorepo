const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const OTP_SALT_ROUNDS = 10;

/**
 * Generate numeric OTP of given length (default: 6)
 * Safe for authentication flows
 */
function generateOtp(length = 6) {
  if (length < 4 || length > 8) {
    throw new Error("OTP length must be between 4 and 8 digits");
  }

  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;

  return crypto.randomInt(min, max + 1).toString();
}

/**
 * Hash OTP using bcrypt
 */
async function hashOtp(otp) {
  return bcrypt.hash(otp, OTP_SALT_ROUNDS);
}

/**
 * Verify OTP against hash
 */
async function verifyOtpHash(otp, hash) {
  return bcrypt.compare(otp, hash);
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtpHash,
};
