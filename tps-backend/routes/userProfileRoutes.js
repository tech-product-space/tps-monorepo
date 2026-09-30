const express = require('express');
const router = express.Router();
const userProfileController = require('../controllers/userProfileController');

router.post('/user-profile', userProfileController.upsertUserProfile);
router.post('/get-user-profile', userProfileController.getUserProfile);
router.get('/get-user-profile-details/:user_id', userProfileController.getCurrentUser);
router.post('/get-user-account', userProfileController.getUserAccount);
router.get('/get-user-profile-by-type', userProfileController.getUsersByType);
router.get('/get-all-types', userProfileController.getAllTypes);
router.post('/get-profile-picture', userProfileController.getProfilePicture);
router.put('/update-profile-picture', userProfileController.updateProfilePicture);

module.exports = router;