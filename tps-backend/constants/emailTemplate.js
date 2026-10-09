/**
 * Library email template types. A template with no type (null) is general.
 *
 * A type exists to say "this template can be filled from one of these":
 * an event template's placeholders are matched against EVENT_TEMPLATE_VARIABLES
 * and filled from the chosen event when it is used in a campaign.
 */
const EMAIL_TEMPLATE_TYPE = Object.freeze({
  EVENT: "event",
});

const EMAIL_TEMPLATE_TYPES = Object.values(EMAIL_TEMPLATE_TYPE);

/**
 * Placeholders an event can fill, and the names each one also answers to —
 * templates are written by hand, and `{{event_name}}` and `{{event_title}}`
 * mean the same thing. The first name is the canonical one, shown in the
 * template editor's hints.
 *
 * Adding a variable is one entry here plus its value in
 * services/emailTemplate/eventTemplateValues.js.
 */
const EVENT_TEMPLATE_VARIABLES = Object.freeze({
  event_title: ["event_title", "event_name"],
  event_subtitle: ["event_subtitle", "event_tagline"],
  event_type: ["event_type", "event_format"],
  event_date: ["event_date", "event_dates"],
  event_time: ["event_time", "event_timing", "event_timings"],
  event_location: ["event_location", "event_venue", "location"],
  join_url: ["join_url", "join_link", "meeting_url", "meeting_link", "zoom_url", "zoom_link"],
  event_url: ["event_url", "event_link", "register_url", "registration_url", "register_link"],
  referral_url: ["referral_url", "referral_link", "dashboard_url", "referral_dashboard_url"],
  whatsapp_url: ["whatsapp_url", "whatsapp_link", "whatsapp_group_url", "whatsapp_group_link"],
});

module.exports = {
  EMAIL_TEMPLATE_TYPE,
  EMAIL_TEMPLATE_TYPES,
  EVENT_TEMPLATE_VARIABLES,
};
