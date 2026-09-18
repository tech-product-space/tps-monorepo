import express from "express";

import {
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
} from "../../controllers/campaign/crud.controller.js";
import {
  listAudienceSources,
  listSenders,
  previewRecipients,
} from "../../controllers/campaign/audience.controller.js";
import {
  cancel,
  retryFailed,
  schedule,
  sendTest,
} from "../../controllers/campaign/send.controller.js";
import { campaignStats } from "../../controllers/campaign/stats.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

// BASE URL -> /campaigns
//
// adminAuth only, no requireRole: any authenticated admin may draft and send
// (decision recorded in MARKETING_CAMPAIGN_PLAN.md §12.3). The guardrails are
// the schedule dialog's explicit confirmation and the activity log, so keep
// both when the send routes land in phase 3.

router.use(adminAuth);

// Static paths first — "/senders" would otherwise be swallowed by "/:id".
router.get("/senders", listSenders);
router.get("/sources", listAudienceSources);

router.post("/", createCampaign);
router.get("/", listCampaigns);

router.get("/:id/preview", previewRecipients);
router.get("/:id/stats", campaignStats);

// Send controls. `schedule` covers send-now too — omit `scheduledAt`.
router.post("/:id/schedule", schedule);
router.post("/:id/cancel", cancel);
router.post("/:id/send-test", sendTest);
router.post("/:id/retry-failed", retryFailed);

// Allowed from any status, including sent — copying last month's send is the
// main reason anyone reaches for it.
router.post("/:id/duplicate", duplicateCampaign);

router.get("/:id", getCampaign);
router.patch("/:id", updateCampaign);
router.delete("/:id", deleteCampaign);

export default router;
