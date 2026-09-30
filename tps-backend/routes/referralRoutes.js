const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');

router.post('/referral-code', referralController.createReferralCode);
router.post('/create-user-referral', referralController.addReferralForUser);
router.post('/referrals/add', referralController.addCohortMember);
router.get('/referrals/all', referralController.getAllReferrals);
router.get('/referrals/:id/members', referralController.getMembersByReferralId);
router.get('/referrals/:referralCode', referralController.getReferralCreatorByCode);
router.put('/referrals/:id', referralController.updateReferral);
router.delete('/referrals/:id', referralController.deleteReferral);

module.exports = router;
