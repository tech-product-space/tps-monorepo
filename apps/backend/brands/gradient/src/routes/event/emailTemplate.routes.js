import express from "express";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { upsertTemplate , getTemplate, sendTestTemplateEmail } from "../../controllers/event/emailTemplate.controller.js";

const router = express.Router();

// BASE URL -> /events/email

router.post("/:eventId/template", adminAuth, upsertTemplate);
router.get("/:eventId/template", adminAuth, getTemplate);
router.post("/:eventId/template/test", adminAuth, sendTestTemplateEmail);

export default router;
