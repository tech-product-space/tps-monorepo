const express = require("express");
const router = express.Router();
const tracking = require("../controllers/workflow/tracking.controller");

// Open pixel
router.get("/t/o/:token", tracking.trackOpen);
// Click redirect
router.get("/t/c/:token", tracking.trackClick);

// Unsubscribe — landing (GET) + one-click confirm (POST)
router.get("/u/:token", tracking.unsubscribeLand);
router.post("/u/:token", tracking.unsubscribeConfirm);

module.exports = router;
