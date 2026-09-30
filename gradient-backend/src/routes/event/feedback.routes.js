import express from "express";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { optionalAuthMiddleware } from "../../middlewares/auth.middleware.js";

import {
  getPublicForm,
  lookupGuest,
  registerForFeedback,
  submitFeedback,
} from "../../controllers/eventFeedback/public.controller.js";

import {
  exportFeedbacks,
  listFeedbacks,
} from "../../controllers/eventFeedback/admin.controller.js";

const router = express.Router();

// BASE URL -> /events/feedback

// Public. optionalAuth so a signed-in visitor is identified by cookie rather
// than by a typed email, without shutting out everyone else — the whole point
// of the single shareable URL is that no account is needed.
router.get("/public/form", getPublicForm);

// None of the three is rate-limited. A whole event moves through them in the
// same twenty minutes, usually from one venue network, so an IP-keyed ceiling
// counts the room as one person and turns everyone past the limit away. What
// bounds them instead: `canAcceptResponse` and `allowSelfRegistrationOnFeedback`
// gate register, and submit 409s any duplicate. See the notes in
// middlewares/rateLimit.middleware.js before putting a limiter back.
router.post("/public/lookup", optionalAuthMiddleware, lookupGuest);

router.post("/public/register", optionalAuthMiddleware, registerForFeedback);

router.post("/public/submit", optionalAuthMiddleware, submitFeedback);

// Admin
router.get("/admin/:eventId", adminAuth, listFeedbacks);
router.get("/admin/:eventId/export", adminAuth, exportFeedbacks);

export default router;
