import express from "express";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

import {
  create,
  updateStatus,
  listForEvent,
  bulkUpdateStatus,
  checkUserJoinedEvent,
  getEventGuestStats,
  linkAccount,
} from "../../controllers/eventGuest/crud.controller.js";

import {
  getMyReferralOverview,
  getMyReferralSummary,
  getMyReferredGuests,
  getReferralLeaderboard,
  getRefereesByReferrer,
  getReferralStats,
  bulkApproveByReferralCount,
} from "../../controllers/eventGuest/referral.controller.js";

import { getMyEvents } from "../../controllers/dashboard/mine.controller.js";

const router = express.Router();

// BASE URL -> /events/guest

router.post("/join", create);
router.get("/check-joined", checkUserJoinedEvent);
router.post("/link-account", authMiddleware, linkAccount);

// Dashboard — identity from the cookie, never a parameter.
router.get("/mine", authMiddleware, getMyEvents);

// Referral — website user
router.get("/referral/mine", authMiddleware, getMyReferralOverview);
router.get("/referral/summary", authMiddleware, getMyReferralSummary);
router.get("/referral/referred", authMiddleware, getMyReferredGuests);

// Referral — admin
router.get("/referral/leaderboard", adminAuth, getReferralLeaderboard);
router.get("/referral/referees", adminAuth, getRefereesByReferrer);
router.get("/referral/stats", adminAuth, getReferralStats);
router.patch(
  "/event/:eventId/referral/bulk-approve",
  adminAuth,
  bulkApproveByReferralCount,
);

router.patch("/:guestId/status", adminAuth, updateStatus);
router.patch("/event/:eventId/status/bulk", adminAuth, bulkUpdateStatus);
router.get("/event/:eventId/guest-status", adminAuth, getEventGuestStats);
router.get("/", adminAuth, listForEvent);

export default router;
