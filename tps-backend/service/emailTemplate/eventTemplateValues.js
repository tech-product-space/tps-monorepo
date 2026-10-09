"use strict";

const { EVENT_TEMPLATE_VARIABLES } = require("../../constants/emailTemplate");

/**
 * An event's details as email template values.
 *
 * Returns `{ values, suggestions }`:
 *
 *   values       placeholder key → text, for every alias in
 *                EVENT_TEMPLATE_VARIABLES that the event can answer. Keys the
 *                event has nothing for are absent, so the admin is asked.
 *   suggestions  key → alternatives the admin can pick with one click, for
 *                values that have no single right answer. Today that is the
 *                WhatsApp link: some events have only a student link and a
 *                professional link, and a campaign goes to everybody at once.
 *
 * Dates and times are stored as "2026-10-24" and "11:00" in IST. They are
 * formatted here so every template reads them the same way.
 */

// Read per call rather than at load, so it never depends on dotenv having run first.
const site = () => (process.env.FRONTEND_URL || "https://theproductspace.in").replace(/\/$/, "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-24" → { y, m, d, dow }, or null. Parsed as a calendar date, not a moment. */
const parseDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/**
 * "Sat, 24 Oct 2026" for one day; "24–25 Oct 2026", "31 Oct – 1 Nov 2026" or
 * "31 Dec 2026 – 1 Jan 2027" for a range.
 */
const formatDateRange = (start, end) => {
  const a = parseDate(start);
  if (!a) return null;
  const b = parseDate(end);

  const one = (x) => `${x.d} ${MONTHS[x.m - 1]} ${x.y}`;

  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) {
    return `${DAYS[a.dow]}, ${one(a)}`;
  }
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${a.y}`;
  return `${one(a)} – ${one(b)}`;
};

/** "14:00" → "2:00 PM". */
const formatTime = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const h = Number(match[1]);
  return `${h % 12 || 12}:${match[2]} ${h < 12 ? "AM" : "PM"}`;
};

/** "2:00 PM – 3:30 PM IST", or just the start. */
const formatTimeRange = (start, end) => {
  const a = formatTime(start);
  if (!a) return null;
  const b = formatTime(end);
  return b && b !== a ? `${a} – ${b} IST` : `${a} IST`;
};

const isUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

const clean = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const eventTemplateValues = (event) => {
  const whatsapp = event.eventDetails?.whatsappLink || {};
  const location = clean(event.location);

  const canonical = {
    event_title: clean(event.eventTitle),
    event_subtitle: clean(event.eventSubtitle),
    event_type: clean(event.eventType),
    event_date: formatDateRange(event.eventStartDate, event.eventEndDate),
    event_time: formatTimeRange(event.eventStartTime, event.eventEndTime),
    // An online event's `location` is its join link; the readable place is
    // then "Online". An offline one's is the address.
    event_location:
      location && !isUrl(location) ? location : clean(event.locationType),
    join_url: isUrl(location) ? location : null,
    event_url: event.eventSlug ? `${site()}/events/${event.eventSlug}` : null,
    referral_url: event.eventSlug ? `${site()}/events/${event.eventSlug}/referral` : null,
    whatsapp_url: clean(whatsapp.Link),
  };

  const values = {};
  for (const [key, aliases] of Object.entries(EVENT_TEMPLATE_VARIABLES)) {
    if (!canonical[key]) continue;
    for (const alias of aliases) values[alias] = canonical[key];
  }

  const suggestions = {};
  const whatsappChoices = [
    clean(whatsapp.Link) && { label: "Default group", value: clean(whatsapp.Link) },
    clean(whatsapp.studentLink) && { label: "Student group", value: clean(whatsapp.studentLink) },
    clean(whatsapp.professionalLink) && {
      label: "Professional group",
      value: clean(whatsapp.professionalLink),
    },
  ].filter(Boolean);

  if (whatsappChoices.length) {
    for (const alias of EVENT_TEMPLATE_VARIABLES.whatsapp_url) suggestions[alias] = whatsappChoices;
  }

  return { values, suggestions };
};

module.exports = { eventTemplateValues, formatDateRange, formatTimeRange };
