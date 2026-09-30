const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.get('/active-users', userController.getAllActiveUsers);
router.get('/active-users/portfolio', userController.getUserPortfolio);
router.patch("/active-users/portfolio/:userId", userController.toggleIsPublished);
router.get("/portfolios", userController.getPublishedUserPortfolio);

module.exports = router;
