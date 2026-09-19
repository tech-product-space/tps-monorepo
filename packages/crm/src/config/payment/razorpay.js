const psEnv = require("@ps/env/crm");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: psEnv.RAZORPAY_KEY_ID,
  key_secret: psEnv.RAZORPAY_KEY_SECRET,
});

module.exports = razorpay;