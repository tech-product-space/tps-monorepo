const express = require('express');
const router = express.Router();
const educationController = require('../controllers/educationController');

router.post('/', educationController.create);
router.get('/:userId', educationController.getByUser);
router.delete('/:id', educationController.remove);

module.exports = router;
