'use strict';

const { BusinessSetting } = require('../models');
const { INVOICE_PREFIX } = require('../config/business');

/**
 * Business settings are a single-row ("singleton") table edited from the CRM
 * and used to render invoices/receipts/statements. The row starts empty — the
 * admin fills in the real business details. Anything left blank is simply not
 * shown on the documents (no placeholder/dummy data).
 */

let _cache = null;

/** Map a BusinessSetting row → the nested config shape used by pdf.service. */
function rowToConfig(row) {
  return {
    legalName: row.legal_name || '',
    tradeName: row.trade_name || '',
    gstin: row.gstin || '',
    gstPercent: row.gst_percent != null ? Number(row.gst_percent) : 18,
    address: {
      line1: row.address_line1 || '',
      line2: row.address_line2 || '',
      city: row.city || '',
      state: row.state || '',
      pincode: row.pincode || '',
      country: row.country || '',
    },
    email: row.email || '',
    website: row.website || '',
    phone: row.phone || '',
    logo: row.logo_url || '',
    // Invoice prefix is not user-editable; the code constant is the source.
    invoicePrefix: INVOICE_PREFIX,
  };
}

/**
 * Build a config (the nested shape pdf.service expects) from a raw snake_case
 * payload — used to preview documents with unsaved Business Settings form values.
 */
function buildConfigFromPayload(payload = {}) {
  return rowToConfig(payload);
}

/** Get (or create the empty) singleton settings row. */
async function getSettingsRow() {
  let row = await BusinessSetting.findOne({ order: [['created_at', 'ASC']] });
  if (!row) row = await BusinessSetting.create({}); // empty — gst_percent defaults to 18
  return row;
}

/** Resolved business config (nested shape) used when rendering documents. */
async function getBusinessConfig() {
  if (_cache) return _cache;
  const row = await getSettingsRow();
  _cache = rowToConfig(row.toJSON());
  return _cache;
}

/** Raw settings row (snake_case) for the settings UI. */
async function getBusinessSettings() {
  const row = await getSettingsRow();
  return row.toJSON();
}

const EDITABLE_FIELDS = [
  'legal_name', 'trade_name',
  'gstin', 'gst_percent',
  'address_line1', 'address_line2', 'city', 'state', 'pincode', 'country',
  'email', 'website', 'phone',
  'logo_url',
];

/** Update the singleton row from a partial payload (snake_case keys). */
async function updateBusinessSettings(payload = {}) {
  const row = await getSettingsRow();
  for (const field of EDITABLE_FIELDS) {
    if (payload[field] !== undefined) {
      row[field] = field === 'gst_percent'
        ? (payload[field] === '' || payload[field] === null ? 18 : Number(payload[field]))
        : payload[field];
    }
  }
  await row.save();
  _cache = null; // invalidate so the next document render reads fresh values
  return row.toJSON();
}

module.exports = {
  getBusinessConfig,
  getBusinessSettings,
  updateBusinessSettings,
  buildConfigFromPayload,
};
