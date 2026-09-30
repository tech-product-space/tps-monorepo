import express from "express";

import {
  getPersonTimeline,
  getPersonSummary,
} from "../../controllers/leadEvent/timeline.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

// BASE URL -> /lead-events

/**
 * Read-only, admin-only, and it stays that way.
 *
 * `lead_events` is append-only, so there is no POST/PUT/DELETE here by design —
 * the same rule `controllers/activityLog/` follows. Writes go through
 * `services/leadEvent/recordLeadEvent.service.js` and nowhere else.
 *
 * `adminAuth` on both: a timeline is one person's entire history with us keyed
 * by their email address, which is the single most sensitive read in the API.
 */
router.get("/admin/timeline", adminAuth, getPersonTimeline);
router.get("/admin/summary", adminAuth, getPersonSummary);

export default router;
