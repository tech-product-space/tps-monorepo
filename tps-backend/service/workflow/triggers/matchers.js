"use strict";

const { LEAD_SOURCE_TYPE } = require("../../../constants/workflow");

/**
 * Predicates that mirror the SQL filters in service/campaign/resolver/*.js.
 * Each takes the raw lead row (from leadLoader.raw) and the per-source filter
 * shape used by the static_list recipient_filter (kept consistent so the same
 * LeadSelector UI works for both trigger types).
 *
 * Returns true if the lead matches the filter, false otherwise.
 * An empty / undefined filter is treated as "match all" for that source.
 */

function matchPlatformLead(lead, filter) {
  // Filter shape: { programs: [{ types: ['type1', ...] }] }
  if (!filter || !Array.isArray(filter.programs) || filter.programs.length === 0) {
    return true; // no filter — match any platform_lead
  }
  const wantedTypes = new Set();
  for (const program of filter.programs) {
    for (const t of program.types || []) {
      wantedTypes.add(t);
    }
  }
  if (wantedTypes.size === 0) return true;
  return wantedTypes.has(lead.type);
}

function matchExternalLead(lead, filter) {
  // Filter shape: { sources: [{ source, form_ids, types, filters: { campaigns, adsets, ads } }] }
  if (!filter || !Array.isArray(filter.sources) || filter.sources.length === 0) {
    return true;
  }
  for (const src of filter.sources) {
    if (src.source && src.source !== lead.source) continue;

    if (Array.isArray(src.form_ids) && src.form_ids.length > 0) {
      if (!src.form_ids.includes(lead.external_form_id)) continue;
    }

    if (Array.isArray(src.types) && src.types.length > 0) {
      if (!src.types.includes(lead.type_id)) continue;
    }

    const f = src.filters || {};
    const additional = lead.additional_data || {};

    if (Array.isArray(f.campaigns) && f.campaigns.length > 0) {
      if (!f.campaigns.includes(additional.campaign_name)) continue;
    }
    if (Array.isArray(f.adsets) && f.adsets.length > 0) {
      if (!f.adsets.includes(additional.adset_name)) continue;
    }
    if (Array.isArray(f.ads) && f.ads.length > 0) {
      if (!f.ads.includes(additional.ad_name)) continue;
    }

    return true; // this source entry matched
  }
  return false;
}

function matchResourceLead(lead, filter) {
  // Filter shape: { resourceFilters: { [resourceId]: { targetRoles: [...] } } }
  if (!filter || !filter.resourceFilters) return true;

  const cfg = filter.resourceFilters[lead.resourceId];
  if (!cfg) return false;

  const roles = cfg.targetRoles || [];
  if (roles.length === 0) return true;
  return roles.includes(lead.jobTitle);
}

function matchRecordingLead(lead, filter) {
  // Filter shape: { recordingFilters: { [recordingId]: {} } }
  //
  // Which recordings, and nothing narrower. The row carries only the recording
  // id, so a category filter would need a lookup on a hot path — and a trigger
  // that queries before deciding whether to fire is a trigger that fires late.
  // Campaign audiences filter by category; those run offline against a join.
  if (!filter || !filter.recordingFilters) return true;

  return Boolean(filter.recordingFilters[lead.recordingId]);
}

function matchEventGuest(lead, filter) {
  // Filter shape: { eventFilters: { [eventId]: { targetGuestRole, targetGuestType } } }
  if (!filter || !filter.eventFilters) return true;

  const cfg = filter.eventFilters[lead.eventId];
  if (!cfg) return false;

  if (cfg.targetGuestRole && cfg.targetGuestRole !== "All") {
    if (lead.userType !== cfg.targetGuestRole) return false;
  }
  if (cfg.targetGuestType && cfg.targetGuestType !== "All") {
    if (lead.guestType !== cfg.targetGuestType) return false;
  }
  return true;
}

function matchUser(_lead, filter) {
  // Users have no `type` discriminator. Filter shape is optional and only
  // supports a coarse match-all today. Phase 5 can add filters like
  // sign-up source (email/google), email domain, etc.
  // An empty/missing filter means "fire for any new user signup".
  if (!filter || Object.keys(filter).length === 0) return true;
  return true;
}

const MATCHERS = {
  [LEAD_SOURCE_TYPE.PLATFORM_LEADS]: matchPlatformLead,
  [LEAD_SOURCE_TYPE.EXTERNAL_LEADS]: matchExternalLead,
  [LEAD_SOURCE_TYPE.RESOURCES]: matchResourceLead,
  [LEAD_SOURCE_TYPE.RECORDINGS]: matchRecordingLead,
  [LEAD_SOURCE_TYPE.EVENTS]: matchEventGuest,
  [LEAD_SOURCE_TYPE.USERS]: matchUser,
};

/**
 * Given a normalized lead and a trigger's recipient_filter, return true if
 * the lead matches at least one of the filter's source entries.
 *
 * filter shape (same as static_list recipient_filter):
 *   { sources: [{ type: 'platform_leads', filters: {...} }, ...] }
 */
function leadMatchesFilter(lead, recipientFilter) {
  if (
    !recipientFilter ||
    !Array.isArray(recipientFilter.sources) ||
    recipientFilter.sources.length === 0
  ) {
    return false; // no sources = nothing to watch
  }

  const entry = recipientFilter.sources.find((s) => s.type === lead.source_type);
  if (!entry) return false;

  const matcher = MATCHERS[lead.source_type];
  if (!matcher) return false;

  return matcher(lead.raw, entry.filters || {});
}

module.exports = {
  leadMatchesFilter,
  // exported for unit testing
  matchPlatformLead,
  matchExternalLead,
  matchResourceLead,
  matchRecordingLead,
  matchEventGuest,
  matchUser,
};
