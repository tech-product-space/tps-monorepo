const psEnv = require("@ps/env/tps");
const Otp = require("../models/mongo/Otp");
const sendOtp = require("../service/whatsapp/sendOtp");
const { verifyOtpToken, generateOtpToken } = require("../utils/otpToken");
const { verifyOtpHash, generateOtp, hashOtp } = require("../utils/otpUtil");
const { PhoneVerification, PlatformLead } = require("../models");

exports.verifyOtp = async (req, res) => {
  const { otp, otpToken } = req.body;

  if (!otp || !otpToken) {
    return res.status(400).json({ error: "OTP and token are required" });
  }

  //Verify JWT token
  let payload = null;
  try {
    payload = verifyOtpToken(otpToken);
  } catch (error) {
    return res.status(400).json({ error: "Invalid or expired OTP" });
  }

  const { otpId, data } = payload;

  //Fetch OTP record
  const otpDoc = await Otp.findById(otpId);
  if (!otpDoc) {
    return res.status(400).json({ error: "Invalid or expired OTP" });
  }

  if (otpDoc.expiresAt < new Date()) {
    await Otp.deleteOne({ _id: otpDoc._id });
    return res.status(400).json({ error: "OTP expired" });
  }

  //Attempt limit
  if (otpDoc.attempts >= 5) {
    return res.status(429).json({ error: "Too many invalid attempts" });
  }

  // Verify OTP
  const isValid = await verifyOtpHash(otp, otpDoc.otp);
  if (!isValid) {
    otpDoc.attempts += 1;
    await otpDoc.save();

    return res.status(400).json({ error: "Invalid OTP" });
  }

  // update entity
  if (otpDoc.entity === "platform-lead") {
    const lead = await PlatformLead.findByPk(data.leadId);

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const countryCode = lead.additionalData?.country_code;

    await PhoneVerification.upsert({
      phone: lead.phone,
      country_code: countryCode,
      verified_at: new Date(),
    });
  }

  //Delete OTP (one-time use)
  await Otp.deleteOne({ _id: otpDoc._id });

  return res.json({
    success: true,
    verified: true,
  });
};

exports.resendOtp = async (req, res) => {
  const { otpToken } = req.body;

  if (!otpToken) {
    return res.status(400).json({ error: "OTP token is required" });
  }

  //Verify JWT token
  let payload = null;
  try {
    payload = verifyOtpToken(otpToken);
  } catch (error) {
    return res.status(400).json({ error: "Invalid or expired OTP token" });
  }

  const { otpId, data } = payload;

  // Fetch OTP
  const otpDoc = await Otp.findById(otpId);
  if (!otpDoc) {
    return res.status(400).json({
      error: "Invalid or expired OTP",
    });
  }

  // Cooldown (1 min)
  const lastSentAt = otpDoc.updatedAt.getTime();
  if (Date.now() - lastSentAt < 1 * 60 * 1000) {
    return res.status(429).json({
      error: "Please wait before requesting another OTP",
    });
  }

  // Generate new OTP
  const otp = generateOtp(4);
  otpDoc.otp = await hashOtp(otp);
  otpDoc.attempts = 0;
  otpDoc.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  otpDoc.retryAttempts += 1;
  await otpDoc.save();

  // Rotate token
  const newOtpToken = generateOtpToken({
    otpId: otpDoc._id,
    data,
    expiry: "10m",
  });

  res.json({
    success: true,
    otpVerificationRequired: true,
    otpToken: newOtpToken,
    otpExpiresIn: 600,
  });

  /**
   * send OTP
   */
  if (psEnv.OTP_MODE === "live") {
    sendOtp(`${otpDoc.countryCode}${otpDoc.phone}`, otp).catch(err => console.error(err));
  } else {
    console.log("OTP:", otp);
  }
};
