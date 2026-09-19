import { Op, fn, col, literal } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import { META_POLL_LOG_STATUS } from "../../config/constants/metaLead.js";
import {
  getSettings,
  updateSettings,
} from "../../services/meta/metaSettings.service.js";
import { syncAllEnabled } from "../../services/meta/metaAccount.service.js";
import { pollLeads } from "../../services/meta/metaIngestion.service.js";

const { MetaAccount, MetaPollLog } = db;

/**
 * Settings, run history and the manual triggers. Super Admin only.
 */

export const getMetaSettings = asyncWrapper(async (req, res) => {
  const settings = await getSettings();

  return res.json({ success: true, data: settings });
});

export const updateMetaSettings = asyncWrapper(async (req, res) => {
  const settings = await updateSettings(req.body);

  return res.json({
    success: true,
    message: settings.pollEnabled ? "Polling enabled" : "Polling paused",
    data: settings,
  });
});

/**
 * Run history.
 *
 * Log rows store `formId` as a plain string so they outlive their form, which
 * means the human name has to be resolved here. Two small grouped lookups
 * rather than an include, because the join would drop every row whose form has
 * since been deleted — exactly the rows worth reading.
 */
export const listLogs = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);

  const where = {};

  if (req.query.accountId) where.accountId = req.query.accountId;
  if (req.query.formId) where.formId = req.query.formId;
  if (req.query.status) where.status = req.query.status;

  // Successful runs that found nothing are the overwhelming majority of rows
  // and tell nobody anything. Off by default, one toggle away.
  if (req.query.onlyInteresting === "true") {
    where[Op.or] = [
      { status: META_POLL_LOG_STATUS.ERROR },
      { newLeads: { [Op.gt]: 0 } },
      { skipped: { [Op.gt]: 0 } },
      { failed: { [Op.gt]: 0 } },
    ];
  }

  const { rows, count } = await MetaPollLog.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  const accountIds = [...new Set(rows.map((row) => row.accountId).filter(Boolean))];
  const formIds = [...new Set(rows.map((row) => row.formId).filter(Boolean))];

  const [accounts, forms] = await Promise.all([
    accountIds.length
      ? MetaAccount.findAll({
          where: { id: { [Op.in]: accountIds } },
          attributes: ["id", "name"],
          raw: true,
        })
      : [],
    formIds.length
      ? db.MetaForm.findAll({
          where: { formId: { [Op.in]: formIds } },
          attributes: ["formId", "name"],
          raw: true,
        })
      : [],
  ]);

  const accountName = new Map(accounts.map((row) => [row.id, row.name]));
  const formName = new Map(forms.map((row) => [row.formId, row.name]));

  return res.json({
    success: true,
    data: rows.map((row) => ({
      ...row.toJSON(),
      accountName: accountName.get(row.accountId) || null,
      formName: formName.get(row.formId) || null,
    })),
    meta: getMeta(count, page, limit),
  });
});

/**
 * Rolling totals for the monitoring tiles.
 *
 * One grouped aggregate rather than five counts. `alreadyImported` is reported
 * on its own and is expected to be large — it is the poll's overlap window
 * doing its job, not waste, and an operator who reads it as a problem will go
 * looking for a bug that is not there. The tile is labelled accordingly.
 */
export const getStats = asyncWrapper(async (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 720);

  const where = { createdAt: { [Op.gte]: new Date(Date.now() - hours * 3600 * 1000) } };

  if (req.query.accountId) where.accountId = req.query.accountId;

  const [agg] = await MetaPollLog.findAll({
    where,
    attributes: [
      [fn("COUNT", col("id")), "runs"],
      [fn("COALESCE", fn("SUM", col("fetchedCount")), 0), "fetched"],
      [fn("COALESCE", fn("SUM", col("newLeads")), 0), "newLeads"],
      [fn("COALESCE", fn("SUM", col("alreadyImported")), 0), "alreadyImported"],
      [fn("COALESCE", fn("SUM", col("skipped")), 0), "skipped"],
      [fn("COALESCE", fn("SUM", col("failed")), 0), "failed"],
      [
        fn(
          "COALESCE",
          fn("SUM", literal(`CASE WHEN status = '${META_POLL_LOG_STATUS.ERROR}' THEN 1 ELSE 0 END`)),
          0,
        ),
        "errors",
      ],
      [fn("MAX", col("createdAt")), "lastRunAt"],
    ],
    raw: true,
  });

  return res.json({
    success: true,
    data: {
      windowHours: hours,
      runs: Number(agg?.runs || 0),
      fetched: Number(agg?.fetched || 0),
      newLeads: Number(agg?.newLeads || 0),
      alreadyImported: Number(agg?.alreadyImported || 0),
      skipped: Number(agg?.skipped || 0),
      failed: Number(agg?.failed || 0),
      errors: Number(agg?.errors || 0),
      lastRunAt: agg?.lastRunAt || null,
    },
  });
});

/**
 * Run the poll now.
 *
 * Awaited rather than queued: the operator clicking this is watching, and a
 * 202 with nothing to show would send them refreshing the log table. It still
 * respects the runtime `pollEnabled` flag — a manual trigger is not a way
 * around the switch someone deliberately turned off.
 */
export const pollNow = asyncWrapper(async (req, res) => {
  const result = await pollLeads();

  if (result.skipped) {
    return res.status(409).json({
      success: false,
      message: "Polling is currently paused. Turn it on to fetch leads.",
    });
  }

  const inserted = result.forms.reduce((total, form) => total + form.inserted, 0);

  return res.json({
    success: true,
    message: `Polled ${result.forms.length} form(s) — ${inserted} new lead(s)`,
    data: result,
  });
});

export const syncAll = asyncWrapper(async (req, res) => {
  const results = await syncAllEnabled();

  const failed = results.filter((result) => result.error);

  return res.json({
    success: true,
    message: failed.length
      ? `Synced ${results.length - failed.length} of ${results.length} account(s)`
      : `Synced ${results.length} account(s)`,
    data: results,
  });
});
