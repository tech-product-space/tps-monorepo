const express = require("express");
const router = express.Router();

const requireStaff = require("../middlewares/requireStaff");
const controller = require("../controllers/emailLibraryTemplate/emailLibraryTemplate.controller");

// Base URL: /email-templates — the library of full-document email templates.
// See ../../EMAIL_TEMPLATES_PLAN.md. Any authenticated admin may use every
// route here; there is no role gating.
router.use(requireStaff);

router.get("/", controller.listTemplates);
router.post("/", controller.createTemplate);

// Before /:id, so "events" is never read as a template id.
router.get("/events", controller.listEvents);
router.get("/events/:eventId/values", controller.getEventValues);

router.get("/:id", controller.getTemplate);
router.patch("/:id", controller.updateTemplate);
router.get("/:id/usage", controller.getUsage);
router.post("/:id/duplicate", controller.duplicateTemplate);
router.patch("/:id/archive", controller.setArchived);
router.post("/:id/send-test", controller.sendTest);

module.exports = router;
