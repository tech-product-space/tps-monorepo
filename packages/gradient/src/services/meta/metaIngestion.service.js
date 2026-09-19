import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import {
  META_BACKFILL_MAX_LEADS,
  META_BACKFILL_PAGE_SIZE,
  META_BACKFILL_STATUS,
  META_DEFAULT_SOURCE,
  META_DEFAULT_SOURCE_DISPLAY_NAME,
  META_IMPORT_SOURCE,
  META_LEAD_STATUS,
  META_POLL_LOG_STATUS,
  META_POLL_LOOKBACK_SECONDS,
  META_POLL_MAX_PAGES,
  META_POLL_PAGE_SIZE,
  META_SKIP_REASON,
} from "../../config/constants/metaLead.js";
import normalizeMetaLeadFields from "../../util/helpers/normalizeMetaLeadFields.js";
import { extractPhoneDetails } from "../../util/helpers/phone.js";
import logger from "../../util/logger.js";

import { graphGet, isInvalidTokenError, parseGraphError } from "./graphClient.js";
import { accountToken, markTokenInvalid } from "./metaAccount.service.js";
import { getSettings, markPolled } from "./metaSettings.service.js";

const { MetaAccount, MetaForm, MetaLead, MetaPollLog, MetaSource } = db;

/**
 * Turning Facebook's payloads into `meta_leads` rows.
 *
 * Shared by the poll job, the backfill job and the manual "fetch now" trigger,
 * which is exactly the "more than one caller" bar that puts something in
 * `services/` in this codebase.
 */

/** The lead fields we ask Graph for. Used identically by poll and backfill. */
const LEAD_FIELDS =
  "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,field_data";

/**
 * Resolve where a lead should be attributed: form mapping, then the account
 * default, then a plain "facebook".
 *
 * The result is written onto the lead row and never recomputed. Remapping a
 * form must not retroactively rewrite the attribution of leads that already
 * arrived under the old rule — the form row holds the current rule, the lead
 * row holds the one that applied to it.
 */
export const resolveRouting = async (account, form) => {
  /**
   * A form that picked its own source owns its sub source too — inheriting the
   * account's would pair one form's programme with another's channel. A form
   * falling through to the account default inherits both halves together.
   */
  const useFormSource = Boolean(form.sourceId);

  const sourceId = form.sourceId || account.defaultSourceId || null;
  const subSourceId = useFormSource
    ? form.subSourceId || null
    : form.subSourceId || account.defaultSubSourceId || null;

  const ids = [sourceId, subSourceId].filter(Boolean);

  const rows = ids.length
    ? await MetaSource.findAll({
        where: { id: { [Op.in]: ids } },
        attributes: ["id", "key", "displayName"],
        raw: true,
      })
    : [];

  const byId = new Map(rows.map((row) => [row.id, row]));

  const source = sourceId ? byId.get(sourceId) : null;
  const subSource = subSourceId ? byId.get(subSourceId) : null;

  return {
    /**
     * Copied onto the lead, not referenced.
     *
     * The catalogue can be renamed, retired or deleted later; a lead's
     * attribution is what it was when it arrived. This is the same reasoning as
     * freezing the mapping generally — see the migration's note.
     */
    source: source?.key || META_DEFAULT_SOURCE,
    sourceDisplayName: source?.displayName || META_DEFAULT_SOURCE_DISPLAY_NAME,

    // The form name is the honest fallback: with no sub source picked, the form
    // is the most specific thing we actually know about where the lead came from.
    subSource: subSource?.key || null,
    subSourceDisplayName: subSource?.displayName || form.name || null,

    courseId: form.courseId || account.defaultCourseId || null,
  };
};

/**
 * Has this person reached us through Facebook before?
 *
 * Scoped to `meta_leads` on purpose. The pipelines are independent by decision,
 * so this does not consult `leads` — the panel answers the cross-channel
 * question at read time with a badge on the detail screen, which couples
 * nothing and costs one indexed lookup only when somebody actually looks.
 */
const isRepeatContact = async ({ email, phone }) => {
  const clauses = [];

  if (email) clauses.push({ email });
  if (phone) clauses.push({ phone });

  if (!clauses.length) return false;

  const existing = await MetaLead.findOne({
    where: { [Op.or]: clauses },
    attributes: ["id"],
  });

  return Boolean(existing);
};

/**
 * Import one batch of raw Graph leads.
 *
 * Returns four separate counts, and the separation is the point:
 *
 *   inserted        new rows in meta_leads
 *   alreadyImported Facebook leads we had already stored — the poll's overlap
 *                   window working as designed, not a problem
 *   skipped         imported, but with no email and no phone
 *   failed          threw, isolated, logged
 *
 * Collapsing `alreadyImported` and the `duplicate` *status* into one number is
 * the bug the CRM this was ported from still has: it reports genuine leads as
 * duplicates and the monitoring tab becomes unreadable.
 */
export const processLeadBatch = async (
  account,
  form,
  leads,
  { importedVia = META_IMPORT_SOURCE.POLL } = {},
) => {
  const counts = { inserted: 0, alreadyImported: 0, skipped: 0, failed: 0 };

  if (!leads?.length) return counts;

  // One query for the whole batch rather than one per lead.
  const seen = await MetaLead.findAll({
    attributes: ["metaLeadId"],
    where: { metaLeadId: { [Op.in]: leads.map((lead) => lead.id) } },
    raw: true,
  });

  const seenIds = new Set(seen.map((row) => row.metaLeadId));

  const routing = await resolveRouting(account, form);

  for (const lead of leads) {
    if (seenIds.has(lead.id)) {
      counts.alreadyImported += 1;
      continue;
    }

    /**
     * Per-lead isolation.
     *
     * On a four-thousand-lead backfill this is the difference between "3,999
     * imported, one logged" and "nothing imported because one answer was
     * malformed".
     */
    try {
      const fields = normalizeMetaLeadFields(lead.field_data);
      const { countryCode, phoneNumber } = extractPhoneDetails(fields.phone);

      const hasContact = Boolean(fields.email || phoneNumber);

      let status = META_LEAD_STATUS.NEW;
      let skipReason = null;

      if (!hasContact) {
        // Kept, not dropped. It is real ad spend and a real person, and the
        // count is the signal that a form is misconfigured.
        status = META_LEAD_STATUS.SKIPPED;
        skipReason = META_SKIP_REASON.NO_CONTACT;
      } else if (await isRepeatContact({ email: fields.email, phone: phoneNumber })) {
        status = META_LEAD_STATUS.DUPLICATE;
      }

      await MetaLead.create({
        metaLeadId: lead.id,
        accountId: account.id,
        formId: form.formId,
        pageId: account.pageId,
        formName: form.name || null,

        name: fields.name,
        email: fields.email,
        phone: phoneNumber,
        countryCode: countryCode ? `+${countryCode}` : null,

        status,
        skipReason,

        ...routing,

        campaignId: lead.campaign_id || null,
        campaignName: lead.campaign_name || null,
        adsetId: lead.adset_id || null,
        adsetName: lead.adset_name || null,
        adId: lead.ad_id || null,
        adName: lead.ad_name || null,

        fields: fields.extraFields,
        rawPayload: lead,

        sourceCreatedAt: lead.created_time
          ? new Date(lead.created_time)
          : new Date(),
        importedVia,
      });

      /**
       * A skipped row counts as skipped and *not* as inserted, so the four
       * numbers add up to `fetched` exactly:
       *
       *   fetched = inserted + skipped + alreadyImported + failed
       *
       * Both are rows in the table; `inserted` means "a lead somebody can
       * actually contact", which is the number anyone reading the monitoring
       * tab is looking for.
       */
      if (status === META_LEAD_STATUS.SKIPPED) counts.skipped += 1;
      else counts.inserted += 1;

      // Guards against Facebook returning the same lead twice in one page,
      // which the pre-fetched set cannot know about.
      seenIds.add(lead.id);
    } catch (error) {
      counts.failed += 1;
      logger.error("Meta lead import failed", {
        metaLeadId: lead?.id,
        formId: form.formId,
        error: error.message,
      });
    }
  }

  // Every row written, contactable or not — this is "how many leads has this
  // form produced", and a form producing only skipped rows is exactly the case
  // the number needs to make visible.
  const written = counts.inserted + counts.skipped;

  if (written > 0) {
    form.leadCount = (form.leadCount || 0) + written;
    await form.save();
  }

  return counts;
};

/**
 * Fetch and import one form's recent leads.
 *
 * The window is `META_POLL_LOOKBACK_SECONDS` (10 minutes) against a 5-minute
 * schedule. The overlap is deliberate: a slow or failed run cannot drop a lead
 * because the next run re-covers its window, and the unique index on
 * `metaLeadId` makes the repeats cost one lookup each.
 *
 * Resolves rather than throws — one broken form must not stop the others, so
 * the failure comes back as a log row.
 */
export const pollForm = async (account, form) => {
  const totals = { fetched: 0, inserted: 0, alreadyImported: 0, skipped: 0, failed: 0 };

  try {
    let url = `/${form.formId}/leads`;

    /**
     * `limit` is not optional here.
     *
     * Without it Graph returns 25, and unlike the backfill the poll cannot come
     * back for the rest — the next cycle's window has already moved past them.
     * A busy form would silently lose every lead after the 25th, and the poll
     * log would record a clean success.
     */
    let params = {
      access_token: accountToken(account),
      fields: LEAD_FIELDS,
      limit: META_POLL_PAGE_SIZE,
      filtering: JSON.stringify([
        {
          field: "time_created",
          operator: "GREATER_THAN",
          value: Math.floor(Date.now() / 1000) - META_POLL_LOOKBACK_SECONDS,
        },
      ]),
    };

    for (let page = 0; url && page < META_POLL_MAX_PAGES; page += 1) {
      const data = await graphGet(url, params);

      const leads = data?.data || [];
      totals.fetched += leads.length;

      const counts = await processLeadBatch(account, form, leads);

      totals.inserted += counts.inserted;
      totals.alreadyImported += counts.alreadyImported;
      totals.skipped += counts.skipped;
      totals.failed += counts.failed;

      // Facebook's `next` already carries fields, limit, filtering and cursor.
      url = data?.paging?.next || null;
      params = undefined;

      if (url && page === META_POLL_MAX_PAGES - 1) {
        logger.warn("Meta poll hit its page cap with more leads waiting", {
          formId: form.formId,
          fetched: totals.fetched,
        });
      }
    }

    return {
      ...totals,
      status: META_POLL_LOG_STATUS.SUCCESS,
      error: null,
    };
  } catch (error) {
    const { message } = parseGraphError(error);

    if (isInvalidTokenError(error)) {
      await markTokenInvalid(account, message);
    }

    // The totals so far, not zeros: a failure on page three does not un-import
    // pages one and two, and reporting 0 would make the log contradict the
    // leads actually sitting in the table.
    return {
      ...totals,
      status: META_POLL_LOG_STATUS.ERROR,
      error: message,
    };
  }
};

/**
 * One full poll cycle across every enabled account and active form.
 *
 * Reads the form list from Postgres — `/leadgen_forms` is never called here.
 * Respects the runtime switch, so an operator can stop ingestion from the panel
 * without a deploy.
 */
export const pollLeads = async () => {
  const settings = await getSettings();

  if (!settings.pollEnabled) {
    logger.info("Meta poll skipped — polling disabled");
    return { skipped: true, reason: "poll_disabled" };
  }

  const accounts = await MetaAccount.findAll({ where: { enabled: true } });

  const summary = [];

  for (const account of accounts) {
    const forms = await MetaForm.findAll({
      where: { accountId: account.id, active: true },
    });

    for (const form of forms) {
      const result = await pollForm(account, form);

      await MetaPollLog.create({
        accountId: account.id,
        formId: form.formId,
        fetchedCount: result.fetched,
        newLeads: result.inserted,
        alreadyImported: result.alreadyImported,
        skipped: result.skipped,
        failed: result.failed,
        status: result.status,
        error: result.error,
      });

      summary.push({ formId: form.formId, ...result });
    }

    account.lastPolledAt = new Date();
    await account.save();
  }

  await markPolled();

  const inserted = summary.reduce((total, row) => total + row.inserted, 0);

  logger.info("Meta poll complete", {
    accounts: accounts.length,
    forms: summary.length,
    inserted,
  });

  return { skipped: false, accounts: accounts.length, forms: summary };
};

/**
 * Import a form's whole history, following Graph's cursor.
 *
 * Long-running, so progress is written to the form row after every page — the
 * panel polls that to show live movement, and a crash leaves a partial count
 * rather than no information at all.
 *
 * Safe to re-run: dedupe is on `metaLeadId`, so a second attempt inserts
 * nothing it already has.
 */
export const runBackfill = async (account, form, sinceDate) => {
  const totals = { fetched: 0, inserted: 0, alreadyImported: 0, skipped: 0, failed: 0 };

  try {
    const firstParams = {
      access_token: accountToken(account),
      fields: LEAD_FIELDS,
      limit: META_BACKFILL_PAGE_SIZE,
    };

    if (sinceDate) {
      firstParams.filtering = JSON.stringify([
        {
          field: "time_created",
          operator: "GREATER_THAN",
          value: Math.floor(sinceDate.getTime() / 1000),
        },
      ]);
    }

    let url = `/${form.formId}/leads`;
    let params = firstParams;

    while (url) {
      const data = await graphGet(url, params);

      const leads = data?.data || [];
      totals.fetched += leads.length;

      const counts = await processLeadBatch(account, form, leads, {
        importedVia: META_IMPORT_SOURCE.BACKFILL,
      });

      totals.inserted += counts.inserted;
      totals.alreadyImported += counts.alreadyImported;
      totals.skipped += counts.skipped;
      totals.failed += counts.failed;

      form.backfillTotal = totals.fetched;
      form.backfillInserted = totals.inserted;
      form.backfillAlreadyImported = totals.alreadyImported;
      form.backfillSkipped = totals.skipped;
      await form.save();

      if (totals.fetched >= META_BACKFILL_MAX_LEADS) {
        logger.warn("Meta backfill hit the safety cap", {
          formId: form.formId,
          cap: META_BACKFILL_MAX_LEADS,
        });
        break;
      }

      // Facebook's `next` is an absolute URL already carrying fields, limit,
      // filtering and the cursor — rebuilding it would only introduce drift.
      url = data?.paging?.next || null;
      params = undefined;
    }

    // Surfaced as a warning even on success: a backfill that quietly lost 40
    // leads should not read as a clean run.
    const note =
      totals.failed > 0
        ? `${totals.failed} lead(s) could not be imported and were skipped — see the server logs.`
        : null;

    form.backfillStatus = META_BACKFILL_STATUS.DONE;
    form.backfillError = note;
    form.backfillFinishedAt = new Date();
    await form.save();

    await MetaPollLog.create({
      accountId: account.id,
      formId: form.formId,
      fetchedCount: totals.fetched,
      newLeads: totals.inserted,
      alreadyImported: totals.alreadyImported,
      skipped: totals.skipped,
      failed: totals.failed,
      status:
        totals.failed > 0
          ? META_POLL_LOG_STATUS.ERROR
          : META_POLL_LOG_STATUS.BACKFILL,
      error: note,
    });

    logger.info("Meta backfill complete", { formId: form.formId, ...totals });

    return totals;
  } catch (error) {
    const { message } = parseGraphError(error);

    if (isInvalidTokenError(error)) {
      await markTokenInvalid(account, message);
    }

    form.backfillStatus = META_BACKFILL_STATUS.ERROR;
    form.backfillError = message;
    form.backfillFinishedAt = new Date();
    await form.save();

    await MetaPollLog.create({
      accountId: account.id,
      formId: form.formId,
      fetchedCount: totals.fetched,
      newLeads: totals.inserted,
      alreadyImported: totals.alreadyImported,
      skipped: totals.skipped,
      failed: totals.failed,
      status: META_POLL_LOG_STATUS.ERROR,
      error: `Backfill: ${message}`,
    });

    logger.error("Meta backfill failed", { formId: form.formId, message });

    return totals;
  }
};
