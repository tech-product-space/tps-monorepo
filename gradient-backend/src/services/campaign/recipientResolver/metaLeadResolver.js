import { Op } from "sequelize";

import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import { META_LEAD_STATUS } from "../../../config/constants/metaLead.js";
import { compact, dateRangeClause, inClause, toRecipient } from "./helpers.js";

const { MetaLead } = db;

/**
 * Facebook Lead Ads leads.
 *
 * `meta_leads` is its own table rather than rows in `leads`
 * (`FACEBOOK_LEADS_PLAN.md` §2), and this resolver is the direct cost of that:
 * without it, a Facebook lead is a row nobody can email. The separate table is
 * why it exists; the registry is why it is only twenty lines.
 *
 * The filters mirror the Meta Leads screen — account, form, campaign, ad set,
 * ad — so a segment somebody built by looking at the list can be rebuilt here
 * from the same vocabulary. The two are meant to line up.
 *
 * The date range is on `sourceCreatedAt`, Facebook's own timestamp, not on
 * `createdAt`. "Everyone from the last 30 days" has to mean 30 days of ads, not
 * 30 days of whenever we happened to import them — otherwise a backfill would
 * sweep five years of leads into every recent-window campaign.
 */
export const resolveMetaLeads = async (filters = {}) => {
  const where = compact({
    accountId: inClause(filters.accountId),
    formId: inClause(filters.formId),
    campaignId: inClause(filters.campaignId),
    adsetId: inClause(filters.adsetId),
    adId: inClause(filters.adId),
    source: inClause(filters.source),
    subSource: inClause(filters.subSource),
    courseId: inClause(filters.courseId),
    sourceCreatedAt: dateRangeClause(filters.createdFrom, filters.createdTo),
  });

  /**
   * Status defaults to everything except `skipped`.
   *
   * A skipped lead has no email by definition, so it could never be mailed
   * anyway — but leaving it in the default would make the preview count and the
   * sendable count differ for a reason nobody could see. An explicit status
   * filter overrides this.
   */
  where.status = filters.status
    ? inClause(filters.status)
    : { [Op.ne]: META_LEAD_STATUS.SKIPPED };

  // A lead with only a phone number is a real lead that cannot receive email.
  // Excluded here; the preview reports the gap separately (see countUnemailable).
  where.email = { [Op.ne]: null };

  const rows = await MetaLead.findAll({
    where,
    attributes: ["id", "name", "email"],
    raw: true,
  });

  return rows.map(toRecipient(CAMPAIGN_SOURCE_TYPE.META_LEADS));
};

/**
 * How many leads this filter set matched that have no email address.
 *
 * Facebook forms very often collect a phone number and nothing else, so the
 * difference between "2,000 leads" on the screen and "1,340 recipients" in the
 * preview can be enormous. Reporting it as its own number is the difference
 * between an operator trusting the preview and assuming it is broken.
 */
export const countUnemailableMetaLeads = async (filters = {}) => {
  const where = compact({
    accountId: inClause(filters.accountId),
    formId: inClause(filters.formId),
    campaignId: inClause(filters.campaignId),
    adsetId: inClause(filters.adsetId),
    adId: inClause(filters.adId),
    source: inClause(filters.source),
    subSource: inClause(filters.subSource),
    courseId: inClause(filters.courseId),
    sourceCreatedAt: dateRangeClause(filters.createdFrom, filters.createdTo),
  });

  where.email = { [Op.is]: null };

  return MetaLead.count({ where });
};
