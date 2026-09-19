const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletterController');

// Public
router.post('/subscribe', newsletterController.subscribe);
router.post('/unsubscribe', newsletterController.unsubscribe);

// Admin
router.get('/history', newsletterController.getHistory);
router.get('/stats', newsletterController.getStats);
router.get('/', newsletterController.getAll);
router.post('/send', newsletterController.sendBulk);
router.post('/send-test', newsletterController.sendTest);
router.delete('/:id', newsletterController.remove);

module.exports = router;
