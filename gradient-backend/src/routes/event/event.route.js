import express from "express";
import {
  createEvent,
  getAllEvents,
  getAllPastEvents,
  updateEvent,
  getEventById,
  toggleEventPublishStatus,
  deleteEvent,
  getAllPublishedEvents,
  getEventBySlug,
  checkEventSlugAvailability,
  toggleEventAcceptResponse,
  updateEventSettings,
  duplicateEvent,
} from "../../controllers/event/crud.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

import eventGuestRoutes from "./eventGuest.routes.js";
import eventEmailRoutes from "./emailTemplate.routes.js";
import eventReminderRoutes from "./eventReminder.routes.js";
import eventFeedbackRoutes from "./feedback.routes.js";
import eventCertificateRoutes from "./certificate.routes.js";

const router = express.Router();

router.use("/guest", eventGuestRoutes)
router.use("/email", eventEmailRoutes)
router.use("/reminders", eventReminderRoutes)
router.use("/feedback", eventFeedbackRoutes)
router.use("/certificates", eventCertificateRoutes)

router.post("/admin/create", adminAuth, createEvent);
router.get("/admin/events", adminAuth, getAllEvents);
router.get("/admin/past-events", adminAuth, getAllPastEvents);
router.get("/admin/events/:id", adminAuth, getEventById);
router.put("/admin/events/:id", adminAuth, updateEvent);
router.post("/admin/events/:id/duplicate", adminAuth, duplicateEvent);
router.patch("/admin/events/:id/toggle-publish", adminAuth, toggleEventPublishStatus);
router.patch("/admin/events/:id/toggle-response", adminAuth, toggleEventAcceptResponse);
router.patch("/admin/events/:id/settings", adminAuth, updateEventSettings);
router.delete("/admin/events/:id", adminAuth, deleteEvent);
router.get("/admin/slug-availability", adminAuth, checkEventSlugAvailability);

router.get("/get-all-events", getAllPublishedEvents);
router.get("/slug/:slug", getEventBySlug);

export default router;
