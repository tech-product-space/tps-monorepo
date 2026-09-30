const express = require('express');
const router = express.Router();
const achievementController = require('../controllers/achievementController');

router.post('/', achievementController.create);
router.get('/:userId', achievementController.getAll);
router.put('/:id', achievementController.update);
router.delete('/:id', achievementController.remove);

module.exports = router;