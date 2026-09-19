const express = require('express');
const router = express.Router();
const personalInfoController = require('../controllers/personalInfoController');

router.post('/', personalInfoController.upsertPersonalInfo);
router.get('/:userId', personalInfoController.getPersonalInfoByUserId);

module.exports = router;