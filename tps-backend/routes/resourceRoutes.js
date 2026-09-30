const express = require("express");
const router = express.Router();
const resourceController = require("../controllers/resourceController");

// slug routes
router.get("/slug-availability", resourceController.checkSlugAvailability);
router.get("/slug/:slug", resourceController.getBySlug);

// Upsert (Create or Update)
router.get("/allleads", resourceController.getAllLeads);
router.post("/", resourceController.upsertResource);
router.get("/all-resources", resourceController.getAllResources);
router.get("/", resourceController.getResources);
router.get("/:id", resourceController.getResourceById);
router.post("/leads", resourceController.createLead);
router.get("/:id/leads", resourceController.getLeadsByResourceId);
router.patch("/:id/publish", resourceController.updatePublishStatus);
router.delete("/:id", resourceController.deleteResource)

module.exports = router;
