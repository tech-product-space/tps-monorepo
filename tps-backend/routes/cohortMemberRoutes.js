const express = require("express");
const router = express.Router();
const uploadCsv = require("../middlewares/uploadCsv");
const asyncWrapper = require('../utils/asyncWrapper');

const {
  createCohortMember,
  bulkUploadCohortMembers,
  getAllCohortMembers,
  getCohortMemberById,
  updateCohortMember,
  deleteCohortMember,
} = require("../controllers/cohortMemberController");

// Create
router.post("/", createCohortMember);
router.post("/bulk-upload", uploadCsv.single("file"),bulkUploadCohortMembers);

// Read
router.get("/", asyncWrapper(getAllCohortMembers));
router.get("/:id", asyncWrapper(getCohortMemberById));

// Update
router.put("/:id", asyncWrapper(updateCohortMember));

// Delete (soft delete)
router.delete("/:id", asyncWrapper(deleteCohortMember));

module.exports = router;