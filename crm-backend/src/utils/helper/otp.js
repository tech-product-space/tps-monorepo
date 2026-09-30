const bcrypt = require("bcryptjs");
const crypto = require("crypto");

/**
 * Numeric OTP generation and verification.
 *
 * Ported verbatim in behaviour from tps-next-backend/utils/otpUtil.js so the
 * two systems' codes look and behave identically to a student who has used
 * both. Kept here rather than imported because the repos do not share code.
 */

const OTP_SALT_ROUNDS = 10;

/**
 * crypto.randomInt, not Math.random — an OTP is a credential, and a predictable
 * one is no better than no OTP at all.
 */
function generateOtp(length = 6) {
  if (length < 4 || length > 8) {
    throw new Error("OTP length must be between 4 and 8 digits");
  }

  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;

  return crypto.randomInt(min, max + 1).toString();
}

async function hashOtp(otp) {
  return bcrypt.hash(String(otp), OTP_SALT_ROUNDS);
}

async function verifyOtpHash(otp, hash) {
  return bcrypt.compare(String(otp), hash);
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtpHash,
};
