const express = require("express");
const router = express.Router();
const asyncWrapper = require("../../utils/asyncWrapper");

const tagController = require("../../controllers/courses/courseTagsController");

// BASE_URL: /course-tags

router.get("/", asyncWrapper(tagController.getAll));
router.post("/", asyncWrapper(tagController.create));
router.put("/:id", asyncWrapper(tagController.update));
router.delete("/:id", asyncWrapper(tagController.delete));

module.exports = router;
