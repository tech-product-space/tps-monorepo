"use strict";
const metaService = require("../services/meta.service");

function handleError(res, err, fallback) {
  const status = err.status || 500;
  if (status >= 500) console.error(fallback, err);
  res.status(status).json({ error: err.message || fallback });
}

/* ── settings ── */
exports.getSettings = async (req, res) => {
  try {
    const settings = await metaService.getSettings();
    res.json(settings);
  } catch (err) {
    handleError(res, err, "Failed to load Meta settings");
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const settings = await metaService.updateSettings(req.body);
    res.json(settings);
  } catch (err) {
    handleError(res, err, "Failed to update Meta settings");
  }
};

/* ── accounts ── */
exports.listAccounts = async (req, res) => {
  try {
    res.json(await metaService.listAccounts());
  } catch (err) {
    handleError(res, err, "Failed to list Meta accounts");
  }
};

exports.createAccount = async (req, res) => {
  try {
    res.status(201).json(await metaService.createAccount(req.body));
  } catch (err) {
    handleError(res, err, "Failed to create Meta account");
  }
};

exports.updateAccount = async (req, res) => {
  try {
    res.json(await metaService.updateAccount(req.params.id, req.body));
  } catch (err) {
    handleError(res, err, "Failed to update Meta account");
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    res.json(await metaService.deleteAccount(req.params.id));
  } catch (err) {
    handleError(res, err, "Failed to delete Meta account");
  }
};

exports.validateToken = async (req, res) => {
  try {
    res.json(await metaService.validateToken(req.params.id));
  } catch (err) {
    handleError(res, err, "Token validation failed");
  }
};

/* ── forms ── */
exports.syncForms = async (req, res) => {
  try {
    res.json(await metaService.syncForms(req.params.id));
  } catch (err) {
    handleError(res, err, "Form sync failed");
  }
};

exports.listForms = async (req, res) => {
  try {
    res.json(await metaService.listForms(req.params.id));
  } catch (err) {
    handleError(res, err, "Failed to list forms");
  }
};

exports.updateForm = async (req, res) => {
  try {
    res.json(await metaService.updateForm(req.params.formId, req.body));
  } catch (err) {
    handleError(res, err, "Failed to update form");
  }
};

exports.startBackfill = async (req, res) => {
  try {
    res.json(
      await metaService.startBackfill(req.params.formId, {
        since: req.body?.since,
      }),
    );
  } catch (err) {
    handleError(res, err, "Failed to start backfill");
  }
};

/* ── manual triggers ── */
exports.syncAll = async (req, res) => {
  try {
    res.json(await metaService.syncAllEnabled());
  } catch (err) {
    handleError(res, err, "Sync-all failed");
  }
};

exports.pollNow = async (req, res) => {
  try {
    res.json(await metaService.pollLeads());
  } catch (err) {
    handleError(res, err, "Manual poll failed");
  }
};

/* ── monitoring ── */
exports.getStats = async (req, res) => {
  try {
    const { accountId, hours } = req.query;
    res.json(await metaService.getStats({ accountId, hours }));
  } catch (err) {
    handleError(res, err, "Failed to load stats");
  }
};

exports.getLogs = async (req, res) => {
  try {
    const { accountId, formId, limit, page } = req.query;
    res.json(await metaService.getLogs({ accountId, formId, limit, page }));
  } catch (err) {
    handleError(res, err, "Failed to load poll logs");
  }
};
