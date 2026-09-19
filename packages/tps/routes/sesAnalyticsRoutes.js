"use strict";

const express = require("express");
const router = express.Router();
const sesAnalyticsController = require("../controllers/sesAnalyticsController");

router.get("/stats", sesAnalyticsController.getStats);
router.get("/logs", sesAnalyticsController.getLogs);
router.get("/filters", sesAnalyticsController.getFilterOptions);

module.exports = router;
