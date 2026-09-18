const express = require("express");
const router = express.Router();
const integrationController = require("../controllers/integration.controller");
const { authenticate } = require("../middlewares/auth.middleware");

// Google redirects the browser here — no JWT available, identity comes
// from the signed `state` param. Must stay above the authenticate gate.
router.get("/google/callback", integrationController.googleCallback);

router.use(authenticate);

router.get("/google/connect", integrationController.googleConnect);
router.get("/google/status", integrationController.googleStatus);
router.delete("/google", integrationController.googleDisconnect);

module.exports = router;
