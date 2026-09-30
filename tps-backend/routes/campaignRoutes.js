const express = require("express");
const router = express.Router();

const campaignController = require("../controllers/campaign/campaign.controller");

router.post("/", campaignController.createCampaign);
router.get("/", campaignController.getCampaigns);

router.get("/events-list", campaignController.getEventsForCampaign);
router.get("/resource-list", campaignController.getResourcesForCampaign);

router.get("/:id/preview", campaignController.previewRecipients);
router.post("/:id/send-test", campaignController.sendTestMail);

router.get("/:id", campaignController.getCampaign);
router.patch("/:id", campaignController.updateCampaign);
router.delete("/:id", campaignController.deleteCampaign);

router.post("/:id/schedule", campaignController.schedule);
router.post("/:id/cancel", campaignController.cancelCampaignSchedule);



module.exports = router;