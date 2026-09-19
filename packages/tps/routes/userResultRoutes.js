const express = require('express');
const router = express.Router();
const { startQuiz, getQuiz, submitAnswer, completeQuiz, isQuizCompleted, getResultByEmail } = require('../controllers/userResultController');

router.post('/start', startQuiz);
router.get('/:userId/:category', getQuiz);
router.post('/answer', submitAnswer);
router.post('/complete', completeQuiz);
router.get('/completed/:email/:category', isQuizCompleted);
router.get('/result/:email/:category', getResultByEmail);

module.exports = router;
