const express = require("express");
const router = express.Router();

const leadConsentController = require("../controllers/lead/leadConsent.controller");

router.post("/opt-out", leadConsentController.optOut);

module.exports = router;
