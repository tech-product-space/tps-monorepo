const express = require('express');
const router = express.Router();
const asyncWrapper = require('../utils/asyncWrapper');
const otpController = require('../controllers/otpController');

// BASE_URL: /otp

router.post("/verify", asyncWrapper(otpController.verifyOtp));
router.post("/resend", asyncWrapper(otpController.resendOtp));

module.exports = router;
