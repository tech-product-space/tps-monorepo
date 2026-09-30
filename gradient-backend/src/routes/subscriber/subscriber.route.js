import express from "express";
import {
  createSubscriber,
  listSubscribers,
} from "../../controllers/subscriber/crud.controller.js";
import {
  unsubscribe,
  verifyUnsubscribeLink,
} from "../../controllers/subscriber/unsubscribe.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { unsubscribeLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

// BASE URL -> /subscribers

router.post("/", createSubscriber);
router.get("/", adminAuth, listSubscribers);

// Public unsubscribe. Lives here rather than in its own router because it acts
// on subscribers — `subscribers` is the suppression list, not a separate table.
// Declared before nothing else matches "/", so ordering is not load-bearing,
// but keep them together.
router.get("/unsubscribe/verify", unsubscribeLimiter, verifyUnsubscribeLink);
router.post("/unsubscribe", unsubscribeLimiter, unsubscribe);

export default router;
