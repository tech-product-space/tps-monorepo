const express = require("express");
const router = express.Router();
const {
  createQuizQuestion,
  getAllQuizQuestions,
  deleteQuizQuestion,
  updateQuizQuestion,
  bulkCreateQuizQuestions
} = require("../controllers/quizController");

router.post("/", createQuizQuestion);
router.put("/:id", updateQuizQuestion);
router.get("/", getAllQuizQuestions);
router.delete("/:id", deleteQuizQuestion);
router.post("/bulk", bulkCreateQuizQuestions);

module.exports = router;
