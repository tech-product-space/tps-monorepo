const express = require('express');
const router = express.Router();
const controller = require('../controllers/memberController');

router.post('/register', controller.registerWithReferral);
router.post('/get-referrals', controller.getReferredMembers);
router.get('/all', controller.getAllMembers);

module.exports = router;
