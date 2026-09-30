const express = require('express');
const router = express.Router();
const referralStatsController = require('../controllers/referralStatsController');

router.get('/summary', referralStatsController.getReferralSummary);
router.get('/referred-users/:userId', referralStatsController.getReferredUsers);

module.exports = router;
