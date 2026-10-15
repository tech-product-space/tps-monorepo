const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewController');

const { learner, admin, publicOrLearner, responsePolicy } = require('../middlewares/interviewAccess');
router.use(responsePolicy);
router.get('/sitemap', interviewController.getQuestionSitemap);
router.get('/directories', interviewController.getQuestionDirectories);

// slug routes
router.get("/question/slug-availability", admin, interviewController.checkSlugAvailability);
router.put("/question/:id/update-slug", admin, interviewController.updateSlug);
router.get("/questions/slug/:slug", publicOrLearner, interviewController.getBySlug);
router.get("/questions/slug/:slug/meta",interviewController.getQuestionMetaBySlug);

router.get('/questions', publicOrLearner, interviewController.getAllQuestions);
router.get('/user/questions', publicOrLearner, interviewController.getAllUserQuestions);
router.get('/published-questions', admin, interviewController.getPublishedQuestionsPaginated);
router.get('/unpublished-questions', admin, interviewController.getUnpublishedQuestionsPaginated);
router.get('/questions/admin/:id', admin, interviewController.getQuestionById);
router.get('/questions/:slug/with-related', interviewController.getQuestionWithRelated);
router.put('/questions/:id/publish', admin, interviewController.togglePublishStatus);
router.post('/questions', learner, interviewController.submitLearnerQuestion);
router.post('/questions/admin', admin, interviewController.createQuestionAdmin);
router.put('/questions/:id/admin', admin, interviewController.updateQuestionAdmin);
router.post('/questions/:questionId/answers', learner, interviewController.addAnswer);
router.post('/questions/:questionId/answers/admin', admin, interviewController.addAnswerAdmin);
router.put('/questions/:questionId/answers/:answerId', learner, interviewController.editAnswer);
router.delete('/questions/:questionId/answers/:answerId', learner, interviewController.deleteAnswer);
router.put('/questions/:questionId/answers/:answerId/admin', admin, interviewController.editAnswerAdmin);
router.delete('/questions/:questionId/answers/:answerId/admin', admin, interviewController.deleteAnswerAdmin);
router.post('/questions/:questionId/answers/:answerId/like', learner, interviewController.likeAnswer);
router.post('/questions/:questionId/answers/:answerId/feedback', learner, interviewController.addFeedback);

router.post('/questions/:questionId/save', learner, interviewController.saveQuestion);
router.get('/saved-questions/:userId', learner, interviewController.getSavedQuestions);

// feedback
router.put('/questions/:questionId/answers/:answerId/feedback/:feedbackId', learner, interviewController.editFeedback);
router.delete('/questions/:questionId/answers/:answerId/feedback/:feedbackId', learner, interviewController.deleteFeedback);
router.put("/questions/:questionId/answers/:answerId/feedback/:feedbackId/admin",admin, interviewController.editFeedbackAdmin);
router.delete("/questions/:questionId/answers/:answerId/feedback/:feedbackId/admin", admin, interviewController.deleteFeedbackAdmin);

// reports ("I got this question")
router.post('/questions/:questionId/reports', learner, interviewController.submitReport);
router.get('/admin/interview-reports', admin, interviewController.listReportsAdmin);
router.put('/admin/interview-reports/:id', admin, interviewController.updateReportAdmin);

// drafts
router.get('/questions/:questionId/draft', learner, interviewController.getDraft);
router.put('/questions/:questionId/draft', learner, interviewController.saveDraft);

// answer moderation flags
router.put('/questions/:questionId/answers/:answerId/expert', admin, interviewController.toggleExpertAnswerAdmin);
router.put('/questions/:questionId/answers/:answerId/pin', admin, interviewController.togglePinnedAnswerAdmin);

// learner submissions & moderation (handover v2)
router.post('/questions/submit', learner, interviewController.submitLearnerQuestion);
router.get('/questions/my-submissions', learner, interviewController.getMySubmissions);
router.get('/questions/suggest-duplicates', interviewController.suggestDuplicates);
router.get('/admin/question-submissions', admin, interviewController.getAdminSubmissions);
router.put('/admin/question-submissions/:id/review', admin, interviewController.reviewSubmission);

module.exports = router;
