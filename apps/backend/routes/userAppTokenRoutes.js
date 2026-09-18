const express = require("express");
const router = express.Router();
const userAppTokenController = require("../controllers/userAppTokenController");

// POST -> create/update token
router.post("/", userAppTokenController.createOrUpdateToken);

// GET -> get token by user_id + apps
router.get("/:user_id/:apps", userAppTokenController.getTokenByUserAndApp);

module.exports = router;