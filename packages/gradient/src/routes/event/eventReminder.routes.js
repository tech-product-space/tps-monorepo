import express from "express";
import { cancelReminder, createReminder, listReminders, removeReminder, scheduleReminder, sendReminderNow, updateReminder , sendTestMailFromReminder } from "../../controllers/event/eventReminder.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

// BASE URL -> /events/reminders

// CRUD
router.post("/", adminAuth, createReminder);
router.get("/", adminAuth, listReminders);
router.put("/:id", adminAuth, updateReminder);
router.delete("/:id", adminAuth, removeReminder);

// Reminder controls
router.post("/:id/schedule", adminAuth, scheduleReminder);
router.post("/:id/cancel", adminAuth, cancelReminder);
router.post("/:id/send-now", adminAuth, sendReminderNow);
router.post("/:id/send-test-email", adminAuth, sendTestMailFromReminder);

export default router;