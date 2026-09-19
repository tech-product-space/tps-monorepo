const express = require("express");
const router = express.Router();

const emailUnSubscribeController = require("../controllers/emailUnsubscribe/emailUnsubscribe.controller");

router.post("/", emailUnSubscribeController.unsubscribeUser);
router.get("/all-unsubscribed-users", emailUnSubscribeController.getUnsubscribedUsers);


module.exports = router;