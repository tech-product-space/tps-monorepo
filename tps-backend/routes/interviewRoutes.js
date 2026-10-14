const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewController');

// slug routes
router.get("/question/slug-availability", interviewController.checkSlugAvailability);
router.put("/question/:id/update-slug", interviewController.updateSlug);
router.get("/questions/slug/:slug", interviewController.getBySlug);
router.get("/questions/slug/:slug/meta",interviewController.getQuestionMetaBySlug);

router.get('/questions', interviewController.getAllQuestions);
router.get('/user/questions', interviewController.getAllUserQuestions);
router.get('/published-questions', interviewController.getPublishedQuestionsPaginated);
router.get('/unpublished-questions', interviewController.getUnpublishedQuestionsPaginated);
router.get('/questions/admin/:id', interviewController.getQuestionById);
router.get('/questions/:slug/with-related', interviewController.getQuestionWithRelated);
router.put('/questions/:id/publish', interviewController.togglePublishStatus);
router.post('/questions', interviewController.createQuestion);
router.post('/questions/admin', interviewController.createQuestionAdmin);
router.put('/questions/:id/admin', interviewController.updateQuestionAdmin);
router.post('/questions/:questionId/answers', interviewController.addAnswer);
router.post('/questions/:questionId/answers/admin', interviewController.addAnswerAdmin);
router.put('/questions/:questionId/answers/:answerId', interviewController.editAnswer);
router.delete('/questions/:questionId/answers/:answerId', interviewController.deleteAnswer);
router.put('/questions/:questionId/answers/:answerId/admin', interviewController.editAnswerAdmin);
router.delete('/questions/:questionId/answers/:answerId/admin', interviewController.deleteAnswerAdmin);
router.post('/questions/:questionId/answers/:answerId/like', interviewController.likeAnswer);
router.post('/questions/:questionId/answers/:answerId/feedback', interviewController.addFeedback);

router.post('/questions/:questionId/save', interviewController.saveQuestion);
router.get('/saved-questions/:userId', interviewController.getSavedQuestions);

// feedback
router.put('/questions/:questionId/answers/:answerId/feedback/:feedbackId', interviewController.editFeedback);
router.delete('/questions/:questionId/answers/:answerId/feedback/:feedbackId', interviewController.deleteFeedback);
router.put("/questions/:questionId/answers/:answerId/feedback/:feedbackId/admin",interviewController.editFeedbackAdmin);
router.delete("/questions/:questionId/answers/:answerId/feedback/:feedbackId/admin", interviewController.deleteFeedbackAdmin);

// reports ("I got this question")
router.post('/questions/:questionId/reports', interviewController.submitReport);
router.get('/admin/interview-reports', interviewController.listReportsAdmin);
router.put('/admin/interview-reports/:id', interviewController.updateReportAdmin);

// drafts
router.get('/questions/:questionId/draft', interviewController.getDraft);
router.put('/questions/:questionId/draft', interviewController.saveDraft);

// answer moderation flags
router.put('/questions/:questionId/answers/:answerId/expert', interviewController.toggleExpertAnswerAdmin);
router.put('/questions/:questionId/answers/:answerId/pin', interviewController.togglePinnedAnswerAdmin);

// learner submissions & moderation (handover v2)
router.post('/questions/submit', interviewController.submitLearnerQuestion);
router.get('/questions/my-submissions', interviewController.getMySubmissions);
router.get('/questions/suggest-duplicates', interviewController.suggestDuplicates);
router.get('/admin/question-submissions', interviewController.getAdminSubmissions);
router.put('/admin/question-submissions/:id/review', interviewController.reviewSubmission);

module.exports = router;