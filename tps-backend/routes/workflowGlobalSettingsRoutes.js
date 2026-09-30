const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/workflow/workflowGlobalSettings.controller");

router.get("/", ctrl.getSettings);
router.put("/", ctrl.updateSettings);

module.exports = router;
