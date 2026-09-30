"use strict";

const { Op, fn, col, literal } = require("sequelize");
const {
  MetaAccount,
  MetaForm,
  MetaLead,
  MetaPollLog,
  MetaSettings,
} = require("../models");
const { encrypt, decrypt } = require("../utils/crypto");
const { createOrProcessReentry } = require("./lead.service");
const {
  normalizeMetaLeadFields,
} = require("../utils/helper/normalizeLeadFields");
const { extractPhoneDetails } = require("../utils/helper/phone");
const axiosClient = require("../cron/meta/axios");

const BASE_URL = "https://graph.facebook.com/v22.0";
// Overlap window: cron runs every 5 min, we fetch the last 10 min so a slow
// run never drops a lead (dedup on meta_lead_id handles the repeats).
const LOOKBACK_SECONDS = 600;

/* ─────────────────────────── token helpers ─────────────────────────── */

function accountToken(account) {
  return decrypt(account.page_token_enc);
}

/* ─────────────────────────── settings ─────────────────────────── */

// Singleton row. Created lazily so a fresh DB (or beta) self-heals.
async function getSettings() {
  let settings = await MetaSettings.findOne();
  if (!settings) settings = await MetaSettings.create({ poll_enabled: true });
  return settings;
}

async function updateSettings(patch) {
  const settings = await getSettings();
  if (typeof patch.poll_enabled === "boolean") {
    settings.poll_enabled = patch.poll_enabled;
  }
  await settings.save();
  return settings;
}

/* ─────────────────────────── account CRUD ─────────────────────────── */

// Never leak the encrypted token to the client.
function serializeAccount(account) {
  const json = account.toJSON ? account.toJSON() : account;
  const { page_token_enc, ...rest } = json;
  return { ...rest, has_token: Boolean(page_token_enc) };
}

async function listAccounts() {
  const accounts = await MetaAccount.findAll({
    order: [["created_at", "ASC"]],
  });
  return accounts.map(serializeAccount);
}

async function getAccountRaw(id) {
  const account = await MetaAccount.findByPk(id);
  if (!account) {
    const err = new Error("Meta account not found");
    err.status = 404;
    throw err;
  }
  return account;
}

async function createAccount(data) {
  if (!data.name || !data.page_id || !data.page_token) {
    const err = new Error("name, page_id and page_token are required");
    err.status = 400;
    throw err;
  }
  const account = await MetaAccount.create({
    name: data.name.trim(),
    page_id: String(data.page_id).trim(),
    page_token_enc: encrypt(data.page_token),
    default_product_id: data.default_product_id || null,
    default_subsource_id: data.default_subsource_id || null,
    enabled: data.enabled !== undefined ? Boolean(data.enabled) : true,
    token_status: "unknown",
  });
  return serializeAccount(account);
}

async function updateAccount(id, data) {
  const account = await getAccountRaw(id);
  if (data.name !== undefined) account.name = data.name.trim();
  if (data.page_id !== undefined) account.page_id = String(data.page_id).trim();
  if (data.default_product_id !== undefined) {
    account.default_product_id = data.default_product_id || null;
  }
  if (data.default_subsource_id !== undefined) {
    account.default_subsource_id = data.default_subsource_id || null;
  }
  if (data.enabled !== undefined) account.enabled = Boolean(data.enabled);
  // Only re-encrypt when a fresh token is supplied (blank = keep existing).
  if (data.page_token) {
    account.page_token_enc = encrypt(data.page_token);
    account.token_status = "unknown";
  }
  await account.save();
  return serializeAccount(account);
}

async function deleteAccount(id) {
  const account = await getAccountRaw(id);
  await account.destroy(); // cascades to meta_forms
  return { success: true };
}

/* ─────────────────────────── token validation ─────────────────────────── */

async function validateToken(id) {
  const account = await getAccountRaw(id);
  try {
    const res = await axiosClient.get(`${BASE_URL}/${account.page_id}`, {
      params: { fields: "id,name", access_token: accountToken(account) },
    });
    account.token_status = "valid";
    account.token_checked_at = new Date();
    account.last_error = null;
    await account.save();
    return { ...serializeAccount(account), page_name: res.data?.name || null };
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    account.token_status = "invalid";
    account.token_checked_at = new Date();
    account.last_error = message;
    await account.save();
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
}

/* ─────────────────────────── form sync ─────────────────────────── */

// Pull the current form list from Graph and upsert into meta_forms. This is
// the ONLY place that hits /leadgen_forms — the poll never does.
async function syncForms(id) {
  const account = await getAccountRaw(id);
  try {
    const res = await axiosClient.get(
      `${BASE_URL}/${account.page_id}/leadgen_forms`,
      {
        params: {
          access_token: accountToken(account),
          fields: "id,name,status",
          limit: 200,
        },
      },
    );

    const forms = res.data?.data || [];
    const now = new Date();
    let created = 0;
    let updated = 0;

    for (const form of forms) {
      const [row, isNew] = await MetaForm.findOrCreate({
        where: { account_id: account.id, form_id: form.id },
        defaults: {
          account_id: account.id,
          form_id: form.id,
          name: form.name || null,
          status: form.status || null,
          active: true,
          last_seen_at: now,
        },
      });
      if (isNew) {
        created++;
      } else {
        // Refresh label/status but keep the admin's product/subsource/active.
        row.name = form.name || row.name;
        row.status = form.status || row.status;
        row.last_seen_at = now;
        await row.save();
        updated++;
      }
    }

    account.last_synced_at = now;
    account.token_status = "valid";
    account.last_error = null;
    await account.save();

    const settings = await getSettings();
    settings.last_sync_at = now;
    await settings.save();

    return { account_id: account.id, total: forms.length, created, updated };
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    account.last_error = message;
    if (error.response?.data?.error?.code === 190) {
      account.token_status = "invalid";
    }
    await account.save();
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
}

async function syncAllEnabled() {
  const accounts = await MetaAccount.findAll({ where: { enabled: true } });
  const results = [];
  for (const account of accounts) {
    try {
      results.push(await syncForms(account.id));
    } catch (error) {
      results.push({ account_id: account.id, error: error.message });
    }
  }
  return results;
}

async function listForms(accountId) {
  const forms = await MetaForm.findAll({
    where: { account_id: accountId },
    order: [["name", "ASC"]],
  });
  return forms;
}

async function updateForm(formRowId, patch) {
  const form = await MetaForm.findByPk(formRowId);
  if (!form) {
    const err = new Error("Form not found");
    err.status = 404;
    throw err;
  }
  if (patch.product_id !== undefined) form.product_id = patch.product_id || null;
  if (patch.subsource_id !== undefined) {
    form.subsource_id = patch.subsource_id || null;
  }
  if (patch.active !== undefined) form.active = Boolean(patch.active);
  await form.save();
  return form;
}

/* ─────────────────────────── lead polling ─────────────────────────── */

// Dedup + create one batch of raw Meta leads. Shared by the live poll and the
// backfill so routing and dedup stay identical. Returns { inserted, duplicates }.
async function processLeadBatch(account, form, leads) {
  let inserted = 0;
  let duplicates = 0;
  let failed = 0;
  if (!leads.length) return { inserted, duplicates, failed };

  const leadIds = leads.map((l) => l.id);
  const existing = await MetaLead.findAll({
    attributes: ["meta_lead_id"],
    where: { meta_lead_id: { [Op.in]: leadIds } },
  });
  const existingSet = new Set(existing.map((e) => e.meta_lead_id));

  const productId = form.product_id || account.default_product_id || null;
  // Subsource: a form on its own product uses only its own mapping; a form
  // falling back to the account's default product also inherits the account's
  // default subsource when it hasn't set one.
  const subsourceId = form.product_id
    ? form.subsource_id || null
    : form.subsource_id || account.default_subsource_id || null;

  for (const lead of leads) {
    if (existingSet.has(lead.id)) {
      duplicates++;
      continue;
    }

    // One malformed lead must not abort the whole batch/backfill — isolate it.
    try {
      const fields = normalizeMetaLeadFields(lead.field_data);
      const { countryCode, phoneNumber } = extractPhoneDetails(fields.phone);

      if (!phoneNumber) {
        console.warn(`Meta lead ${lead.id} skipped → no phone`);
        await MetaLead.create({
          meta_lead_id: lead.id,
          form_id: form.form_id,
          page_id: account.page_id,
          lead_id: null,
          raw_payload: lead,
        });
        duplicates++;
        continue;
      }

      const leadPayload = {
        // Column caps: profile name is VARCHAR(100), email VARCHAR(255) —
        // Facebook answers can exceed these, so clamp before insert.
        name: fields.name ? String(fields.name).slice(0, 100) : fields.name,
        phone: phoneNumber,
        email: fields.email ? String(fields.email).slice(0, 255) : fields.email,
        country_code: countryCode ? `+${countryCode}` : "",

        product_id: productId,
        subsource_id: subsourceId,

        extra_fields: {
          campaign_name: lead.campaign_name || null,
          ad_name: lead.ad_name || null,
          adset_name: lead.adset_name || null,
          form_name: form.name || null,
          created_time: lead.created_time,
          ...fields.extraFields,
        },

        additional_data: {
          campaign_id: lead.campaign_id || null,
          ad_id: lead.ad_id || null,
          adset_id: lead.adset_id || null,
          form_id: form.form_id || null,
        },

        source_created_at: lead.created_time,
      };

      const result = await createOrProcessReentry(
        leadPayload,
        null,
        "Meta Ads Cron",
      );

      await MetaLead.create({
        meta_lead_id: lead.id,
        form_id: form.form_id,
        ad_id: lead.ad_id || null,
        adset_id: lead.adset_id || null,
        campaign_id: lead.campaign_id || null,
        page_id: account.page_id,
        lead_id: result?.lead?.id || null,
        raw_payload: lead,
      });

      inserted++;
    } catch (err) {
      failed++;
      console.error(
        `Meta lead ${lead.id} failed: ${err && err.message ? err.message : err}`,
      );
    }
  }

  if (inserted > 0) {
    form.lead_count = (form.lead_count || 0) + inserted;
    await form.save();
  }

  return { inserted, duplicates, failed };
}

// Ingest one form's recent leads (last LOOKBACK_SECONDS). Returns log counts.
async function pollForm(account, form) {
  try {
    const leadsResponse = await axiosClient.get(
      `${BASE_URL}/${form.form_id}/leads`,
      {
        params: {
          access_token: accountToken(account),
          fields:
            "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_name,campaign_id,field_data",
          filtering: JSON.stringify([
            {
              field: "time_created",
              operator: "GREATER_THAN",
              value: Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS,
            },
          ]),
        },
      },
    );

    const leads = leadsResponse.data?.data || [];
    const { inserted, duplicates } = await processLeadBatch(
      account,
      form,
      leads,
    );
    return {
      fetched: leads.length,
      inserted,
      duplicates,
      status: "success",
    };
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    if (error.response?.data?.error?.code === 190) {
      account.token_status = "invalid";
      account.last_error = message;
      await account.save();
    }
    return {
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      status: "error",
      error: message,
    };
  }
}

/* ─────────────────────────── backfill ─────────────────────────── */

const BACKFILL_PAGE_SIZE = 100;
const BACKFILL_MAX_LEADS = 50000; // safety cap against a runaway paginator

// Kick off an all-time (or since-dated) backfill for one form. Returns
// immediately; the actual paging runs detached and reports progress on the
// form row (backfill_* columns), which the UI polls.
async function startBackfill(formRowId, { since } = {}) {
  const form = await MetaForm.findByPk(formRowId);
  if (!form) {
    const err = new Error("Form not found");
    err.status = 404;
    throw err;
  }
  if (form.backfill_status === "running") {
    const err = new Error("A backfill is already running for this form");
    err.status = 409;
    throw err;
  }

  const account = await MetaAccount.findByPk(form.account_id);
  if (!account) {
    const err = new Error("Account not found");
    err.status = 404;
    throw err;
  }

  let sinceDate = null;
  if (since) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) {
      const err = new Error("Invalid 'since' date");
      err.status = 400;
      throw err;
    }
    sinceDate = d;
  }

  form.backfill_status = "running";
  form.backfill_total = 0;
  form.backfill_inserted = 0;
  form.backfill_duplicates = 0;
  form.backfill_since = sinceDate;
  form.backfill_error = null;
  form.backfill_started_at = new Date();
  form.backfill_finished_at = null;
  await form.save();

  // Detached — do NOT await. Errors are captured onto the row by runBackfill.
  runBackfill(account, form, sinceDate).catch((e) => {
    console.error("Backfill crashed:", e && e.message ? e.message : e);
  });

  return { status: "running", form_id: form.form_id };
}

// Paginate the form's entire lead history, processing each page and persisting
// progress after every page. Facebook's paging.next is a full URL that already
// carries fields/limit/filtering + the cursor, so we just follow it.
async function runBackfill(account, form, sinceDate) {
  let totalFetched = 0;
  let totalInserted = 0;
  let totalDuplicates = 0;
  let totalFailed = 0;

  try {
    const firstParams = {
      access_token: accountToken(account),
      fields:
        "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_name,campaign_id,field_data",
      limit: BACKFILL_PAGE_SIZE,
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

    let url = `${BASE_URL}/${form.form_id}/leads`;
    let params = firstParams;

    while (url) {
      const res = await axiosClient.get(url, params ? { params } : undefined);
      const leads = res.data?.data || [];
      totalFetched += leads.length;

      const { inserted, duplicates, failed } = await processLeadBatch(
        account,
        form,
        leads,
      );
      totalInserted += inserted;
      totalDuplicates += duplicates;
      totalFailed += failed;

      // Persist progress after each page so the UI can show it live.
      form.backfill_total = totalFetched;
      form.backfill_inserted = totalInserted;
      form.backfill_duplicates = totalDuplicates;
      await form.save();

      if (totalFetched >= BACKFILL_MAX_LEADS) break;

      const next = res.data?.paging?.next;
      url = next || null;
      params = undefined; // the next URL already carries all query params
    }

    const failNote =
      totalFailed > 0
        ? `${totalFailed} lead(s) could not be imported and were skipped (see server logs).`
        : null;

    form.backfill_status = "done";
    form.backfill_error = failNote; // surfaced as a warning even on success
    form.backfill_finished_at = new Date();
    await form.save();

    await MetaPollLog.create({
      account_id: account.id,
      form_id: form.form_id,
      fetched_count: totalFetched,
      new_leads: totalInserted,
      duplicates: totalDuplicates,
      status: totalFailed > 0 ? "error" : "backfill",
      error: failNote,
    });
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    form.backfill_status = "error";
    form.backfill_error = message;
    form.backfill_finished_at = new Date();
    await form.save();

    await MetaPollLog.create({
      account_id: account.id,
      form_id: form.form_id,
      fetched_count: totalFetched,
      new_leads: totalInserted,
      duplicates: totalDuplicates,
      status: "error",
      error: `Backfill: ${message}`,
    });
  }
}

// Full poll cycle across every enabled account and its active forms. Reads
// forms from the DB — no /leadgen_forms call. Respects the global switch.
async function pollLeads() {
  const settings = await getSettings();
  if (!settings.poll_enabled) {
    return { skipped: true, reason: "poll_disabled" };
  }

  const accounts = await MetaAccount.findAll({ where: { enabled: true } });
  const summary = [];

  for (const account of accounts) {
    const forms = await MetaForm.findAll({
      where: { account_id: account.id, active: true },
    });

    for (const form of forms) {
      const r = await pollForm(account, form);
      await MetaPollLog.create({
        account_id: account.id,
        form_id: form.form_id,
        fetched_count: r.fetched,
        new_leads: r.inserted,
        duplicates: r.duplicates,
        status: r.status,
        error: r.error || null,
      });
      summary.push({ form: form.form_id, ...r });
    }

    account.last_polled_at = new Date();
    await account.save();
  }

  settings.last_poll_at = new Date();
  await settings.save();

  return { skipped: false, accounts: accounts.length, forms: summary };
}

/* ─────────────────────────── monitoring ─────────────────────────── */

async function getLogs({ accountId, formId, limit = 100, page = 1 } = {}) {
  const where = {};
  if (accountId) where.account_id = accountId;
  if (formId) where.form_id = formId;

  const parsedLimit = Math.min(Number(limit) || 100, 500);
  const parsedPage = Math.max(Number(page) || 1, 1);

  const { rows, count } = await MetaPollLog.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit: parsedLimit,
    offset: (parsedPage - 1) * parsedLimit,
  });

  // Enrich each log with the human form name + account name. Logs only store
  // form_id (a string), so resolve names via a couple of small lookups.
  const formIds = [...new Set(rows.map((r) => r.form_id).filter(Boolean))];
  const accountIds = [
    ...new Set(rows.map((r) => r.account_id).filter(Boolean)),
  ];

  const [forms, accounts] = await Promise.all([
    formIds.length
      ? MetaForm.findAll({
          attributes: ["form_id", "name"],
          where: { form_id: { [Op.in]: formIds } },
        })
      : [],
    accountIds.length
      ? MetaAccount.findAll({
          attributes: ["id", "name"],
          where: { id: { [Op.in]: accountIds } },
        })
      : [],
  ]);

  const formNameById = new Map(forms.map((f) => [f.form_id, f.name]));
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

  const data = rows.map((r) => {
    const json = r.toJSON();
    return {
      ...json,
      // Sequelize exposes timestamps as camelCase attributes; expose snake_case
      // to match the rest of the API (and what the frontend reads).
      created_at: json.created_at || json.createdAt || null,
      form_name: formNameById.get(r.form_id) || null,
      account_name: accountNameById.get(r.account_id) || null,
    };
  });

  return {
    data,
    pagination: {
      total: count,
      page: parsedPage,
      pageSize: parsedLimit,
      totalPages: Math.ceil(count / parsedLimit),
    },
  };
}

// Aggregate poll activity over a rolling window (for the monitoring tiles).
async function getStats({ accountId, hours = 24 } = {}) {
  const windowHours = Math.min(Math.max(Number(hours) || 24, 1), 720);
  const since = new Date(Date.now() - windowHours * 3600 * 1000);

  const where = { created_at: { [Op.gte]: since } };
  if (accountId) where.account_id = accountId;

  const [agg] = await MetaPollLog.findAll({
    where,
    attributes: [
      [fn("COUNT", col("id")), "runs"],
      [fn("COALESCE", fn("SUM", col("fetched_count")), 0), "fetched"],
      [fn("COALESCE", fn("SUM", col("new_leads")), 0), "new_leads"],
      [fn("COALESCE", fn("SUM", col("duplicates")), 0), "duplicates"],
      [
        fn(
          "COALESCE",
          fn("SUM", literal("CASE WHEN status = 'error' THEN 1 ELSE 0 END")),
          0,
        ),
        "errors",
      ],
      [fn("MAX", col("created_at")), "last_run_at"],
    ],
    raw: true,
  });

  return {
    window_hours: windowHours,
    runs: Number(agg?.runs || 0),
    fetched: Number(agg?.fetched || 0),
    new_leads: Number(agg?.new_leads || 0),
    duplicates: Number(agg?.duplicates || 0),
    errors: Number(agg?.errors || 0),
    last_run_at: agg?.last_run_at || null,
  };
}

module.exports = {
  getSettings,
  updateSettings,
  getStats,
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  validateToken,
  syncForms,
  syncAllEnabled,
  listForms,
  updateForm,
  startBackfill,
  pollLeads,
  getLogs,
};
