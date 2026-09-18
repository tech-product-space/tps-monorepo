const EVENT_EMAIL_TARGET_TYPES = Object.freeze({
  ALL: "All",
  APPROVED: "Approved",
  WAITLIST: "Waitlist",
  DECLINED: "Declined",
});

const EVENT_EMAIL_TARGET_ROLES = Object.freeze({
  ALL: "All",
  PROFESSIONAL: "Professional",
  STUDENT: "Student",
});

const EVENT_EMAIL_TEMPLATE_STATUS = Object.freeze({
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  SENT: "sent",
  FAILED: "failed",
});

module.exports = {
  EVENT_EMAIL_TARGET_TYPES,
  EVENT_EMAIL_TEMPLATE_STATUS,
  EVENT_EMAIL_TARGET_ROLES
};