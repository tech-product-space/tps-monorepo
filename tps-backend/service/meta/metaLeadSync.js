const axios = require("axios");
const { ExternalLead } = require("../../models");
const { normalizeMetaLeadFields } = require("../../utils/normalizeLeadFields");
const { EXTERNAL_LEAD_SOURCE } = require("../../constants/externalLeads");

const META_BASE = "https://graph.facebook.com/v22.0";

const BACKFILL_CHUNK_SIZE = 1000;

// Verbose step-by-step logging, dev only — prod keeps the lean logs.
const IS_DEV = process.env.NODE_ENV === "development";

function devLog(...args) {
  if (IS_DEV) console.log("[meta-sync:dev]", ...args);
}

// Forms with a sync in flight (manual or cron — both run in the API
// process, so this single set guards them against each other).
const runningSyncs = new Set();

function buildRawData(fieldData = []) {
  const obj = {};
  for (const field of fieldData) {
    obj[field.name] = field.values?.[0] || null;
  }
  return obj;
}

/**
 * Copy leads this form already has in our DB into any mapped type that is
 * missing them. Covers newly mapped types (full history, beyond Meta's
 * 90-day API retention) and rows lost to the old global-unique constraint.
 *
 * Inserts with hooks:false — backfilled history must not fire workflow
 * triggers; only genuinely new leads from Meta do.
 */
async function backfillMissingTypeRows(form) {
  const mappedTypeIds = form.leadTypeMappings.map((m) => m.lead_type_id);

  if (!mappedTypeIds.length) return 0;

  devLog(
    `backfill check — form ${form.form_id}, mapped types: [${mappedTypeIds.join(", ")}]`,
  );

  const existingRows = await ExternalLead.findAll({
    where: {
      external_form_id: form.form_id,
      source: EXTERNAL_LEAD_SOURCE.META,
    },
    attributes: [
      "id",
      "external_lead_id",
      "type_id",
      "name",
      "email",
      "phone",
      "external_created_at",
      "form_data",
      "additional_data",
    ],
    raw: true,
  });

  if (!existingRows.length) {
    devLog(`backfill — form ${form.form_id} has no rows in DB yet, nothing to copy`);
    return 0;
  }

  const byLead = new Map();

  for (const row of existingRows) {
    let entry = byLead.get(row.external_lead_id);

    if (!entry) {
      entry = { typeIds: new Set(), row, nullRowId: null };
      byLead.set(row.external_lead_id, entry);
    }

    if (row.type_id) entry.typeIds.add(row.type_id);
    else entry.nullRowId = row.id;
  }

  const inserts = [];
  // Rows synced while the form was unmapped (type_id null) get adopted into
  // the first missing mapped type instead of copied — keeps row ids stable
  // for any workflow enrollments referencing them, and avoids a leftover
  // typeless duplicate in the leads list.
  const adoptionsByType = new Map();

  for (const { typeIds, row, nullRowId } of byLead.values()) {
    const missing = mappedTypeIds.filter((t) => !typeIds.has(t));
    if (!missing.length) continue;

    let start = 0;

    if (nullRowId) {
      const ids = adoptionsByType.get(missing[0]) || [];
      ids.push(nullRowId);
      adoptionsByType.set(missing[0], ids);
      start = 1;
    }

    for (let i = start; i < missing.length; i++) {
      inserts.push({
        external_lead_id: row.external_lead_id,
        external_created_at: row.external_created_at,
        name: row.name,
        email: row.email,
        phone: row.phone,
        source: EXTERNAL_LEAD_SOURCE.META,
        type_id: missing[i],
        external_form_id: form.form_id,
        form_data: row.form_data,
        additional_data: row.additional_data,
      });
    }
  }

  let adopted = 0;

  for (const [typeId, rowIds] of adoptionsByType) {
    for (let i = 0; i < rowIds.length; i += BACKFILL_CHUNK_SIZE) {
      await ExternalLead.update(
        { type_id: typeId },
        {
          where: { id: rowIds.slice(i, i + BACKFILL_CHUNK_SIZE), type_id: null },
          hooks: false,
        },
      );
    }
    adopted += rowIds.length;
  }

  devLog(
    `backfill — form ${form.form_id}: ${byLead.size} distinct leads in DB, ${adopted} typeless rows adopted, ${inserts.length} missing type rows to copy (silent, no workflow hooks)`,
  );

  for (let i = 0; i < inserts.length; i += BACKFILL_CHUNK_SIZE) {
    await ExternalLead.bulkCreate(inserts.slice(i, i + BACKFILL_CHUNK_SIZE), {
      ignoreDuplicates: true,
      hooks: false,
    });
    devLog(
      `backfill — form ${form.form_id}: inserted chunk ${i + 1}-${Math.min(i + BACKFILL_CHUNK_SIZE, inserts.length)} of ${inserts.length}`,
    );
  }

  return adopted + inserts.length;
}

async function runMetaFormSync(form) {
  const accessToken = form.page.page_access_token;

  // A form's first-ever sync pulls history, not live arrivals — insert it
  // silently so mapping an old form doesn't fire a workflow per old lead.
  const existingCount = await ExternalLead.count({
    where: {
      external_form_id: form.form_id,
      source: EXTERNAL_LEAD_SOURCE.META,
    },
  });
  const isFirstSync = existingCount === 0;

  devLog(
    `form ${form.form_id} (${form.form_name}) — ${existingCount} rows in DB, firstSync=${isFirstSync}${isFirstSync ? " (workflow hooks suppressed for this run)" : ""}`,
  );

  const backfilled = await backfillMissingTypeRows(form);

  if (backfilled) {
    console.log(
      `[meta-sync] form ${form.form_id} — backfilled ${backfilled} rows into newly mapped types`,
    );
  }

  let url = `${META_BASE}/${form.form_id}/leads`;
  let totalInserted = backfilled;
  let pageNumber = 0;

  while (url) {
    pageNumber += 1;
    const response = await axios.get(url, {
      params: {
        access_token: accessToken,
        limit: 500,
        fields:
          "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_name,campaign_id,field_data",
      },
    });

    const leads = response.data.data || [];

    if (!leads.length) {
      devLog(`form ${form.form_id} — page ${pageNumber}: Meta returned no leads, stopping`);
      break;
    }

    const leadIds = leads.map((l) => l.id);

    const existingLeads = await ExternalLead.findAll({
      where: { external_lead_id: leadIds },
      attributes: ["external_lead_id", "type_id"],
    });

    // Dedup per (lead, type): a lead mapped to several types gets one row
    // in each, but never two rows in the same type.
    const existingPairs = new Set(
      existingLeads.map((l) => `${l.external_lead_id}:${l.type_id}`),
    );

    // Unmapped forms still sync — their leads get type_id null so that
    // form-based live triggers can fire. When a lead type is mapped later,
    // backfillMissingTypeRows adopts the null rows into it.
    const mappings = form.leadTypeMappings.length
      ? form.leadTypeMappings
      : [{ lead_type_id: null }];

    const inserts = [];

    for (const lead of leads) {
      const fields = normalizeMetaLeadFields(lead.field_data);
      const rawData = buildRawData(lead.field_data);

      for (const mapping of mappings) {
        if (existingPairs.has(`${lead.id}:${mapping.lead_type_id}`)) continue;

        inserts.push({
          external_lead_id: lead.id,
          external_created_at: lead.created_time,
          name: fields.name,
          email: fields.email,
          phone: fields.phone,
          source: EXTERNAL_LEAD_SOURCE.META,
          type_id: mapping.lead_type_id,
          external_form_id: form.form_id,
          form_data: rawData,
          additional_data: {
            campaign_id: lead.campaign_id || null,
            campaign_name: lead.campaign_name || null,
            ad_id: lead.ad_id || null,
            ad_name: lead.ad_name || null,
            adset_id: lead.adset_id || null,
            adset_name: lead.adset_name || null,
          },
        });
      }
    }

    devLog(
      `form ${form.form_id} — page ${pageNumber}: ${leads.length} leads from Meta, ${inserts.length} new rows to insert`,
    );

    if (inserts.length) {
      await ExternalLead.bulkCreate(inserts, {
        ignoreDuplicates: true,
        hooks: !isFirstSync,
      });
      totalInserted += inserts.length;
    } else {
      // Meta returns leads newest-first. A whole page of duplicates means
      // every older page is already in our DB — safe to stop.
      devLog(
        `form ${form.form_id} — page ${pageNumber}: all already in DB, early stop`,
      );
      break;
    }

    url = response.data.paging?.next || null;
  }

  devLog(
    `form ${form.form_id} — done: ${totalInserted} total inserted (${backfilled} backfill + ${totalInserted - backfilled} from Meta) across ${pageNumber} page(s)`,
  );

  return totalInserted;
}

module.exports = {
  runMetaFormSync,
  backfillMissingTypeRows,
  buildRawData,
  runningSyncs,
};
