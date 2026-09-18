const express = require('express');
const router = express.Router();
const asyncWrapper = require('../../utils/asyncWrapper');
const faqsController = require('../../controllers/courses/faqController');

// BASE_URL: /courses/faqs

router.post("/:courseId", asyncWrapper(faqsController.create));
router.put("/:id", asyncWrapper(faqsController.update));
router.delete("/:id",asyncWrapper(faqsController.delete));
router.get("/:courseId",asyncWrapper(faqsController.getByCourseId));
router.put("/:courseId/reorder", asyncWrapper(faqsController.reorder));

module.exports = router;