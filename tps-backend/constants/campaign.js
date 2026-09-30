const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: "draft",
  SENDING: "sending",
  SENT: "sent",
  FAILED: "failed",
  SCHEDULED: "scheduled",
});

const CAMPAIGN_RECIPIENT_STATUS = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  SENT: "sent",
  FAILED: "failed",
});

module.exports = {
  CAMPAIGN_STATUS,
  CAMPAIGN_RECIPIENT_STATUS
};
