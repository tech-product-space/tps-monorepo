'use strict';

/**
 * Business identity used on all legal documents (GST invoices, receipts).
 * Update these before going live.
 */
const BUSINESS = {
  legalName: 'ProductSpace Learning Pvt. Ltd.',
  tradeName: 'ProductSpace',
  gstin: '27AABCP1234A1Z5',           // dummy — replace with real GSTIN
  sacCode: '999293',                  // SAC: Online education services
  pan: 'AABCP1234A',                  // dummy — replace with real PAN
  address: {
    line1: '123, Example Tower, MG Road',
    line2: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    stateCode: '29',                  // GST state code for Karnataka
    pincode: '560001',
    country: 'India',
  },
  email: 'info@theproductspace.in',
  website: 'https://theproductspace.in',
  phone: '+91 98765 43210',           // dummy — replace with real number
  logoUrl: 'https://theproductspace.in/logo.png', // used in PDF header
};

/**
 * Indian GST — 18% (9% CGST + 9% SGST).
 * IGST applies when buyer is outside the seller's state (currently not split; treat as IGST).
 */
const GST = {
  rate: 0.18,
  cgstRate: 0.09,
  sgstRate: 0.09,
  igstRate: 0.18,
};

/**
 * Payment source display details — shown on receipts and invoices.
 * key matches the `source` column in the payments table.
 */
const PAYMENT_SOURCE_DETAILS = {
  bank_transfer: {
    label: 'Bank Transfer',
    accountName: 'ProductSpace Learning Pvt. Ltd.',
    bankName: 'HDFC Bank',
    accountNumber: 'XXXX XXXX XXXX',  // dummy
    ifsc: 'HDFC0001234',              // dummy
    branch: 'MG Road, Bengaluru',
  },
  razorpay: {
    label: 'Razorpay',
    note: 'Payment processed via Razorpay payment gateway.',
  },
  cashfree: {
    label: 'Cashfree',
    note: 'Payment processed via Cashfree payment gateway.',
  },
};

/**
 * Invoice number format: TPS/<FY_SHORT>/<SEQ>
 * e.g. TPS/25-26/0001
 */
const INVOICE_PREFIX = 'TPS';

/**
 * Returns the Indian financial year short label (e.g. "25-26") for a given date.
 */
function financialYearLabelFor(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-based
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
}

/**
 * Returns the current Indian financial year short label (e.g. "25-26").
 */
function currentFinancialYearLabel() {
  return financialYearLabelFor(new Date());
}

/**
 * Formats a sequential invoice number given a sequence integer.
 * e.g. formatInvoiceNumber(1) → "TPS/25-26/0001"
 * The prefix is configurable (business settings) and falls back to INVOICE_PREFIX.
 * The financial-year segment defaults to the current FY but can be overridden
 * (e.g. for a back-dated invoice) so the number matches the printed date.
 */
function formatInvoiceNumber(sequence, prefix = INVOICE_PREFIX, fyLabel = currentFinancialYearLabel()) {
  return `${prefix || INVOICE_PREFIX}/${fyLabel}/${String(sequence).padStart(4, '0')}`;
}

module.exports = {
  BUSINESS,
  GST,
  PAYMENT_SOURCE_DETAILS,
  INVOICE_PREFIX,
  financialYearLabelFor,
  currentFinancialYearLabel,
  formatInvoiceNumber,
};
