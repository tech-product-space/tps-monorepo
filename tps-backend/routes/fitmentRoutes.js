const express = require('express');
const router = express.Router();
const { createOrUpdateFitment, getFitmentByUserId } = require('../controllers/fitmentController');

router.post('/', createOrUpdateFitment);
router.get('/:userId', getFitmentByUserId);

module.exports = router;