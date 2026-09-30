const express = require('express');
const router = express.Router();
const asyncWrapper = require('../utils/asyncWrapper');
const notificationController = require('../controllers/service/notificationController');

// BASE_URL: /service

router.get("/notifications/stream", asyncWrapper(notificationController.notificationStream));

module.exports = router;
