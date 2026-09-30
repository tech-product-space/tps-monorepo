const express = require("express");
const router = express.Router();

const workflowController = require("../controllers/workflow/workflow.controller");

router.post("/", workflowController.createWorkflow);
router.get("/", workflowController.listWorkflows);

// Place before /:id so the literal segment matches first.
router.post("/test-email", workflowController.sendTestEmail);

router.get("/:id", workflowController.getWorkflow);
router.put("/:id", workflowController.updateWorkflow);
router.delete("/:id", workflowController.archiveWorkflow);

router.post("/:id/validate", workflowController.validateWorkflow);
router.post("/:id/publish", workflowController.publishWorkflow);
router.post("/:id/run", workflowController.runWorkflow);
router.post("/:id/enroll-one", workflowController.enrollOne);
router.post("/:id/pause", workflowController.pauseWorkflow);
router.post("/:id/resume", workflowController.resumeWorkflow);
router.post("/:id/duplicate", workflowController.duplicateWorkflow);

module.exports = router;
