const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth.middleware");
const controller = require("../controllers/push.controller");

router.use(authenticate);

router.get("/vapid-key", controller.getVapidKey);
router.post("/subscribe", controller.subscribe);
router.post("/unsubscribe", controller.unsubscribe);

module.exports = router;
