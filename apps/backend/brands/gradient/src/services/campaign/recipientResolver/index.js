import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";

import { resolveLeads } from "./leadResolver.js";
import { resolveResourceLeads } from "./resourceLeadResolver.js";
import { resolveRecordingLeads } from "./recordingLeadResolver.js";
import { resolveProjectLeads } from "./projectLeadResolver.js";
import { resolveEventGuests } from "./eventGuestResolver.js";
import { resolveFreeCourseEnrolments } from "./freeCourseEnrolmentResolver.js";
import { resolveSubscribers } from "./subscriberResolver.js";
import { resolveUsers } from "./userResolver.js";
import { resolveCampaignRecipients } from "./campaignRecipientResolver.js";
import { resolveContactLists } from "./contactListResolver.js";
import { resolveCertificateHolders } from "./certificateHolderResolver.js";
import { resolveFreeCourseProgress } from "./freeCourseProgressResolver.js";
import { resolveEventFeedback } from "./eventFeedbackResolver.js";
import { resolveEventReferrers } from "./eventReferrerResolver.js";
import { resolveMetaLeads } from "./metaLeadResolver.js";

/**
 * The authority on which audience sources actually work.
 *
 * `CAMPAIGN_SOURCE_TYPE` is the vocabulary; this is the implementation. The
 * sources endpoint and buildRecipients both read from here, so a source is
 * offered to the panel if and only if something can resolve it.
 *
 * All fifteen are implemented — twelve from phase 6, META_LEADS with the
 * Facebook integration, RECORDING_LEADS with the recordings library, and
 * PROJECT_LEADS with the projects hub. Keep the split: a source added to
 * the constant without a resolver here must produce a named error rather than
 * an empty audience, because "nobody matched" and "that source does not work"
 * should not look the same to whoever is staring at a preview of zero.
 */
export const RESOLVERS = Object.freeze({
  [CAMPAIGN_SOURCE_TYPE.LEADS]: resolveLeads,
  [CAMPAIGN_SOURCE_TYPE.RESOURCE_LEADS]: resolveResourceLeads,
  [CAMPAIGN_SOURCE_TYPE.RECORDING_LEADS]: resolveRecordingLeads,
  [CAMPAIGN_SOURCE_TYPE.PROJECT_LEADS]: resolveProjectLeads,
  [CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS]: resolveEventGuests,
  [CAMPAIGN_SOURCE_TYPE.FREE_COURSE_ENROLMENTS]: resolveFreeCourseEnrolments,
  [CAMPAIGN_SOURCE_TYPE.SUBSCRIBERS]: resolveSubscribers,
  [CAMPAIGN_SOURCE_TYPE.USERS]: resolveUsers,
  [CAMPAIGN_SOURCE_TYPE.CAMPAIGN_RECIPIENTS]: resolveCampaignRecipients,
  [CAMPAIGN_SOURCE_TYPE.CONTACT_LISTS]: resolveContactLists,
  [CAMPAIGN_SOURCE_TYPE.CERTIFICATE_HOLDERS]: resolveCertificateHolders,
  [CAMPAIGN_SOURCE_TYPE.FREE_COURSE_PROGRESS]: resolveFreeCourseProgress,
  [CAMPAIGN_SOURCE_TYPE.EVENT_FEEDBACK]: resolveEventFeedback,
  [CAMPAIGN_SOURCE_TYPE.EVENT_REFERRERS]: resolveEventReferrers,
  [CAMPAIGN_SOURCE_TYPE.META_LEADS]: resolveMetaLeads,
});

export const SUPPORTED_SOURCE_TYPES = Object.freeze(Object.keys(RESOLVERS));

export const isSupportedSourceType = (type) =>
  Object.prototype.hasOwnProperty.call(RESOLVERS, type);
