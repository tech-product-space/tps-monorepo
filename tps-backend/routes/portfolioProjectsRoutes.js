const express = require('express');
const router = express.Router();
const portfolioController = require('../controllers/portfolioProjectController');

router.post('/', portfolioController.create);
router.get('/:userId', portfolioController.getAllByUser);
router.put('/:id', portfolioController.update);
router.delete('/:id', portfolioController.remove);
router.get('/id/:id', portfolioController.getById);
router.post('/users', portfolioController.getAllProjectsByUserPresence);

module.exports = router;
