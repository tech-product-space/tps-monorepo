const express = require("express");
const router = express.Router();
const sesWebhook = require("../controllers/workflow/sesWebhook.controller");

// SNS posts JSON but with Content-Type: text/plain. The global express.text()
// middleware in server.js handles that; the controller parses manually.
router.post("/ses", sesWebhook.sesNotification);

module.exports = router;
