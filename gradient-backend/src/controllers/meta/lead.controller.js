import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import { META_LEAD_EDITABLE_STATUS } from "../../config/constants/metaLead.js";

const { Lead, MetaAccount, MetaLead } = db;

/**
 * The Meta Leads screen.
 *
 * Reachable by any authenticated admin, unlike the configuration routes — the
 * people who work leads are not Super Admins, and a lead list they cannot open
 * is a feature that does not exist.
 */

/** Sorting is a whitelist: the column name reaches a query. */
const SORTABLE = new Set(["sourceCreatedAt", "createdAt", "name", "status"]);

/**
 * `sourceCreatedAt` — Facebook's timestamp — is the default, not `createdAt`.
 *
 * They differ for every backfilled row, sometimes by years. Sorting on our
 * import time would bury a form's real history under whichever afternoon
 * somebody happened to run the import.
 */
const DEFAULT_SORT = "sourceCreatedAt";

const inClause = (value) => {
  if (value === undefined || value === null || value === "") return undefined;

  const list = Array.isArray(value)
    ? value
    : String(value).split(",").map((item) => item.trim());

  const cleaned = list.filter(Boolean);

  return cleaned.length ? { [Op.in]: cleaned } : undefined;
};

const buildWhere = (query) => {
  const where = {};

  const filters = {
    accountId: inClause(query.accountId),
    formId: inClause(query.formId),
    campaignId: inClause(query.campaignId),
    adsetId: inClause(query.adsetId),
    adId: inClause(query.adId),
    status: inClause(query.status),
    source: inClause(query.source),
    subSource: inClause(query.subSource),
    courseId: inClause(query.courseId),
  };

  // Sequelize reads `{ status: undefined }` as `status IS NULL`, which turns
  // "no filter" into "match nothing" — a campaign of zero with no explanation.
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) where[key] = value;
  }

  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;

  const range = {};
  if (from && !Number.isNaN(from.getTime())) range[Op.gte] = from;
  if (to && !Number.isNaN(to.getTime())) range[Op.lte] = to;

  if (Object.getOwnPropertySymbols(range).length) {
    where.sourceCreatedAt = range;
  }

  if (query.search) {
    const term = `%${String(query.search).trim()}%`;

    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
      { phone: { [Op.iLike]: term } },
    ];
  }

  return where;
};

/**
 * `rawPayload` is deliberately excluded from the list.
 *
 * It is the largest column in the table and nothing on a list row shows it.
 * Returning it would make a page of 50 leads tens of times bigger than it needs
 * to be, for data the detail drawer fetches on demand anyway.
 */
const LIST_ATTRIBUTES = { exclude: ["rawPayload"] };

export const listLeads = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);

  const sortBy = SORTABLE.has(req.query.sortBy) ? req.query.sortBy : DEFAULT_SORT;
  const sortDir = String(req.query.sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

  const { rows, count } = await MetaLead.findAndCountAll({
    where: buildWhere(req.query),
    attributes: LIST_ATTRIBUTES,
    limit,
    offset,
    order: [[sortBy, sortDir]],
    include: [
      {
        model: MetaAccount,
        as: "account",
        attributes: ["id", "name", "pageId"],
      },
    ],
  });

  return res.json({
    success: true,
    data: rows,
    meta: getMeta(count, page, limit),
  });
});

/**
 * The filter dropdowns.
 *
 * Derived from the leads themselves rather than from `meta_forms`, so the
 * options are what actually produced leads — a form that has never converted
 * anyone is noise in a filter list. Campaign, ad set and ad only exist here at
 * all because they were stored as real columns.
 */
export const listFilters = asyncWrapper(async (req, res) => {
  const where = {};

  // Cascading: narrowing by account narrows the forms offered, and so on down.
  if (req.query.accountId) where.accountId = req.query.accountId;
  if (req.query.campaignId) where.campaignId = req.query.campaignId;
  if (req.query.adsetId) where.adsetId = req.query.adsetId;

  const distinct = async (idField, nameField) => {
    const rows = await MetaLead.findAll({
      where,
      attributes: [idField, nameField],
      group: [idField, nameField],
      order: [[nameField, "ASC"]],
      raw: true,
    });

    return rows
      .filter((row) => row[idField])
      .map((row) => ({ id: row[idField], name: row[nameField] || row[idField] }));
  };

  const [accounts, forms, campaigns, adsets, ads] = await Promise.all([
    MetaAccount.findAll({
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
      raw: true,
    }),
    distinct("formId", "formName"),
    distinct("campaignId", "campaignName"),
    distinct("adsetId", "adsetName"),
    distinct("adId", "adName"),
  ]);

  const sources = await MetaLead.findAll({
    where,
    attributes: ["source", "sourceDisplayName", "subSource", "subSourceDisplayName"],
    group: ["source", "sourceDisplayName", "subSource", "subSourceDisplayName"],
    raw: true,
  });

  return res.json({
    success: true,
    data: { accounts, forms, campaigns, adsets, ads, sources },
  });
});

export const getLead = asyncWrapper(async (req, res) => {
  const lead = await MetaLead.findByPk(req.params.id, {
    include: [
      {
        model: MetaAccount,
        as: "account",
        attributes: ["id", "name", "pageId"],
      },
    ],
  });

  if (!lead) {
    return res.status(404).json({ success: false, message: "Lead not found" });
  }

  /**
   * The cross-channel answer, at read time.
   *
   * `meta_leads` and `leads` are deliberately independent — ingestion never
   * queries across — so this is where the two are reconciled: one indexed
   * lookup, only when a human opens the record. It recovers most of the value
   * of cross-channel dedupe and couples nothing at write time.
   */
  let websiteLead = null;

  if (lead.email) {
    websiteLead = await Lead.findOne({
      where: { email: lead.email },
      attributes: ["id", "name", "email", "source", "status", "createdAt"],
      order: [["createdAt", "DESC"]],
    });
  }

  return res.json({
    success: true,
    data: { ...lead.toJSON(), websiteLead },
  });
});

/**
 * Status, and nothing else.
 *
 * Every other column on this row is Facebook's record of what somebody typed
 * into an ad. Editing it would make the table a worse copy of the truth rather
 * than a record of it — and `rawPayload` would immediately contradict whatever
 * was changed.
 */
export const updateLeadStatus = asyncWrapper(async (req, res) => {
  const { status } = req.body || {};

  if (!META_LEAD_EDITABLE_STATUS.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `status must be one of: ${META_LEAD_EDITABLE_STATUS.join(", ")}`,
    });
  }

  const lead = await MetaLead.findByPk(req.params.id);

  if (!lead) {
    return res.status(404).json({ success: false, message: "Lead not found" });
  }

  lead.status = status;
  await lead.save();

  req.activity?.set({ entityLabel: lead.name || lead.email || lead.metaLeadId });

  return res.json({
    success: true,
    message: "Status updated",
    data: lead,
  });
});

/**
 * CSV of the current filter set.
 *
 * Capped and streamed as one response rather than paginated: an export is
 * either the whole selection or it is misleading. The cap is high enough for
 * any realistic filtered view and low enough not to hold a connection open for
 * minutes.
 */
const EXPORT_LIMIT = 10_000;

const CSV_COLUMNS = [
  ["name", "Name"],
  ["email", "Email"],
  ["countryCode", "Country Code"],
  ["phone", "Phone"],
  ["status", "Status"],
  ["formName", "Form"],
  ["campaignName", "Campaign"],
  ["adsetName", "Ad Set"],
  ["adName", "Ad"],
  ["source", "Source"],
  ["subSource", "Sub Source"],
  ["sourceCreatedAt", "Received"],
];

/** RFC 4180 quoting. A form answer containing a comma is not hypothetical. */
const csvCell = (value) => {
  if (value === null || value === undefined) return "";

  const text = value instanceof Date ? value.toISOString() : String(value);

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const exportLeads = asyncWrapper(async (req, res) => {
  const rows = await MetaLead.findAll({
    where: buildWhere(req.query),
    attributes: LIST_ATTRIBUTES,
    order: [[DEFAULT_SORT, "DESC"]],
    limit: EXPORT_LIMIT,
  });

  const header = CSV_COLUMNS.map(([, label]) => label).join(",");

  const body = rows
    .map((row) => CSV_COLUMNS.map(([key]) => csvCell(row[key])).join(","))
    .join("\n");

  const filename = `meta-leads-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  // Excel reads a bare UTF-8 CSV as the system codepage and mangles any name
  // that is not ASCII. The BOM is what stops that.
  return res.send(`﻿${header}\n${body}`);
});
