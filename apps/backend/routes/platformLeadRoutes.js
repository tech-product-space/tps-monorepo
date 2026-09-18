const express = require("express");
const router = express.Router();
const platformLeadController = require("../controllers/platformLeadController");


router.get("/", platformLeadController.getAllLeads);
router.post("/", platformLeadController.createLead);
router.patch("/:leadId/phone", platformLeadController.updateLeadPhone);
router.post("/step-one", platformLeadController.createLeadStepOne);
router.patch("/step-one/update", platformLeadController.updateLeadStepOne);
router.patch("/step-two", platformLeadController.updateLeadStepTwo);

router.get("/download", platformLeadController.downloadPlatformLeads);

router.post("/status", platformLeadController.getLeadsByStatus);
router.put("/:id/status", platformLeadController.updateLeadStatus);

router.put("/:id/assign", platformLeadController.assignLead);
router.get("/assigned/:name", platformLeadController.getLeadsByAssignee);
router.put("/:id/unassign", platformLeadController.unassignLead);

router.delete("/bulk", platformLeadController.deleteLeadsByIds);
router.delete("/:id", platformLeadController.deleteLead);

router.get("/type/:type", platformLeadController.getLeadsByType);
module.exports = router;
