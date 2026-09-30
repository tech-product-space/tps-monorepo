'use strict';

const fs   = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { BUSINESS, PAYMENT_SOURCE_DETAILS, formatInvoiceNumber } = require('../config/business');

/* ─── Brand palette (Product Space) ─────────────────────────────────────────── */
// Primary blue: #3B6AE8  |  Accent teal: #09C5A5
const BRAND = {
  blue:   '#3B6AE8',   // primary brand blue (from website banner)
  teal:   '#09C5A5',   // accent teal
  blueBg: '#3B6AE8',   // header band background
  blueLight: '#EEF2FF', // very light blue for table headers
  blueDark:  '#2A52C4', // darker blue for contrast text on light bg
};

/* ─── Logo (embedded as base64 so Puppeteer can render it offline) ───────────── */
function logoDataUri() {
  const candidates = [
    { ext: '.png',  mime: 'image/png'  },
    { ext: '.jpg',  mime: 'image/jpeg' },
    { ext: '.jpeg', mime: 'image/jpeg' },
  ];
  for (const { ext, mime } of candidates) {
    const p = path.join(__dirname, `../assets/logo${ext}`);
    if (fs.existsSync(p)) {
      return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
    }
  }
  return null;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

const CURRENCY_SYMBOLS = {
  INR: '₹', USD: '$', GBP: '£', EUR: '€',
  SGD: 'S$', AED: 'AED ', AUD: 'A$', CAD: 'C$',
};

function formatAmount(amount, currency) {
  const num = Number(amount || 0);
  const cur = (currency || 'INR').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[cur] ?? (cur + ' ');
  const locale = cur === 'INR' ? 'en-IN' : 'en-US';
  return `${symbol}${num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date) {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return '—'; }
}

function formatDateTime(date) {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return '—'; }
}

function phoneDisplay(profile) {
  const phone = profile.phone || '';
  if (!phone) return '';
  // Fall back to the LeadProfile default dial code (+91) when missing, so a
  // country code always appears on receipts/invoices.
  const raw = profile.country_code || '+91';
  const code = `+${String(raw).replace(/^\+/, '')}`;
  return `${code} ${phone}`;
}

function businessAddressHtml(business = BUSINESS) {
  const a = business.address || {};
  const cityState = [[a.city, a.state].filter(Boolean).join(', '), a.pincode]
    .filter(Boolean).join(' – ');
  return [a.line1, a.line2, cityState, a.country].filter(Boolean).join('<br>');
}

function sourceLabel(source) {
  return PAYMENT_SOURCE_DETAILS[source]?.label || source?.replace(/_/g, ' ') || '—';
}

/* ─── Base styles ────────────────────────────────────────────────────────────── */

const BASE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    color: #1e293b;
    background: #fff;
    padding: 0;
    padding-bottom: 64px;
    line-height: 1.5;
  }
  .page-body { padding: 36px 44px; }

  /* ── Header band ── */
  .doc-header-band {
    background: ${BRAND.blueBg};
    padding: 24px 44px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .brand-logo  { height: 38px; width: auto; display: block; margin-bottom: 6px; border-radius: 8px; }
  .brand-name  { font-size: 22px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
  .brand-sub   { font-size: 11px; color: rgba(255,255,255,0.65); margin-top: 2px; }
  .brand-address { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 8px; line-height: 1.7; }
  .gstin-badge {
    display: inline-block;
    background: rgba(255,255,255,0.18);
    color: #fff;
    font-size: 10px; font-weight: 600;
    padding: 2px 9px; border-radius: 4px;
    margin-top: 8px; letter-spacing: 0.5px;
    border: 1px solid rgba(255,255,255,0.3);
  }
  .doc-meta { text-align: right; }
  .doc-type   { font-size: 18px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 1.5px; }
  .doc-number { font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 5px; }
  .doc-date   { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 3px; }

  /* ── Parties ── */
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
  .party-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px 18px; }
  .party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 8px; }
  .party-name  { font-size: 14px; font-weight: 600; color: #1e293b; }
  .party-detail { font-size: 12px; color: #64748b; margin-top: 3px; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th {
    background: ${BRAND.blueLight};
    text-align: left;
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.8px;
    color: ${BRAND.blueDark};
    padding: 10px 13px;
    border-bottom: 2px solid ${BRAND.blue};
  }
  td { padding: 11px 13px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .text-right  { text-align: right; }
  .text-center { text-align: center; }
  .amount { font-weight: 600; font-variant-numeric: tabular-nums; }
  tr:nth-child(even) td { background: #f8f9ff; }

  /* ── Summary box ── */
  .summary-box { margin-left: auto; width: 300px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .summary-row { display: flex; justify-content: space-between; padding: 9px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  .summary-row:last-child { border-bottom: none; }
  .summary-row.total { background: ${BRAND.blue}; color: #fff; font-weight: 700; font-size: 14px; }
  .summary-row.total .amount { color: #fff; }

  /* ── Misc ── */
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .badge-paid    { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
  .badge-partial { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
  .badge-pending { background: #fff7ed; color: #ea580c; border: 1px solid #fed7aa; }
  .status-row { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
  .section-title {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1px; color: ${BRAND.blue};
    margin-bottom: 10px; margin-top: 4px;
    padding-bottom: 4px; border-bottom: 1px solid #c7d4f9;
  }
  .footer {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    padding: 10px 44px;
    background: ${BRAND.blueLight};
    border-top: 2px solid ${BRAND.blue};
    display: flex; justify-content: space-between; align-items: center;
  }
  .footer-note { font-size: 11px; color: #64748b; max-width: 420px; line-height: 1.5; }
  .footer-brand { text-align: right; font-size: 11px; color: ${BRAND.blue}; font-weight: 600; }
  .invoice-note {
    font-size: 11px; color: #64748b;
    border: 1px solid #c7d4f9; border-radius: 6px;
    padding: 10px 14px; margin-top: 20px; line-height: 1.7;
    background: #f5f7ff;
  }
`;

/* ─── Shared header band ─────────────────────────────────────────────────────── */

function headerBand(docType, docNumber, docDate, business = BUSINESS) {
  // Prefer the uploaded logo; fall back to the bundled brand asset if present.
  const logo = business.logo || logoDataUri();
  const brandName = business.tradeName || business.legalName || '';
  const nameTag = brandName ? `<div class="brand-name">${brandName}</div>` : '';
  const brandLeft = logo
    ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
         <img src="${logo}" class="brand-logo" style="margin-bottom:0;" alt="${brandName}" />
         ${nameTag}
       </div>`
    : nameTag;

  const address = businessAddressHtml(business);
  const showLegal = business.legalName && business.legalName !== brandName;

  return `
    <div class="doc-header-band">
      <div>
        ${brandLeft}
        ${showLegal ? `<div class="brand-sub">${business.legalName}</div>` : ''}
        ${address ? `<div class="brand-address">${address}</div>` : ''}
        ${business.gstin ? `<div class="gstin-badge">GSTIN: ${business.gstin}</div>` : ''}
      </div>
      <div class="doc-meta">
        <div class="doc-type">${docType}</div>
        <div class="doc-number">${docNumber}</div>
        <div class="doc-date">${docDate ? formatDate(docDate) : ''}</div>
      </div>
    </div>`;
}

/* ─── Shared footer (identical across receipt / invoice / statement) ─────────── */

function footerHtml(business = BUSINESS) {
  const contact = [business.email, business.phone].filter(Boolean).join(' · ');
  const note = `This is a computer-generated document${business.tradeName ? ` from ${business.tradeName}` : ''}.${contact ? `<br>Contact: ${contact}` : ''}`;
  const brand = [business.tradeName, business.website].filter(Boolean).join(' · ');
  return `
  <div class="footer">
    <div class="footer-note">${note}</div>
    ${brand ? `<div class="footer-brand">${brand}</div>` : ''}
  </div>`;
}

/* ─── Puppeteer: HTML → PDF ─────────────────────────────────────────────────── */

async function htmlToPdf(html) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

/* ─── 1. Payment Receipt ─────────────────────────────────────────────────────── */

function buildReceiptHtml(payment, leadCourse, profile, business = BUSINESS) {
  const buyerName  = profile.name  || 'Customer';
  const buyerEmail = profile.email || '';
  const cur = leadCourse.currency || 'INR';

  const receiptNumber = `RCPT-${payment.id.slice(0, 8).toUpperCase()}`;
  const paidAt = payment.paid_at || payment.created_at;
  const amount = Number(payment.amount || 0);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
  <style>${BASE_STYLES}</style></head><body>
  ${headerBand('Payment Receipt', receiptNumber, new Date(), business)}
  <div class="page-body">

  <div class="status-row">
    <span class="badge badge-paid">✓ Payment Received</span>
    <span style="font-size:12px;color:#64748b">${formatDateTime(paidAt)}</span>
  </div>

  <div class="parties">
    <div class="party-box">
      <div class="party-label">Received From</div>
      <div class="party-name">${buyerName}</div>
      ${buyerEmail ? `<div class="party-detail">${buyerEmail}</div>` : ''}
      ${phoneDisplay(profile) ? `<div class="party-detail">${phoneDisplay(profile)}</div>` : ''}
    </div>
    <div class="party-box">
      <div class="party-label">Received By</div>
      <div class="party-name">${business.legalName || business.tradeName || ''}</div>
      ${business.email ? `<div class="party-detail">${business.email}</div>` : ''}
      ${business.gstin ? `<div class="party-detail">GSTIN: ${business.gstin}</div>` : ''}
    </div>
  </div>

  <p class="section-title">Payment Details</p>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Course</th>
        <th>Reference</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${payment.description || 'Course payment'}</td>
        <td>${leadCourse.program_name}</td>
        <td>${payment.reference || '—'}</td>
        <td class="text-right amount">${formatAmount(amount, cur)}</td>
      </tr>
    </tbody>
  </table>

  <div class="summary-box">
    <div class="summary-row">
      <span>Amount Paid</span>
      <span class="amount">${formatAmount(amount, cur)}</span>
    </div>
    <div class="summary-row total">
      <span>Total Received</span>
      <span class="amount">${formatAmount(amount, cur)}</span>
    </div>
  </div>

  </div>
  ${footerHtml(business)}
  </body></html>`;
}

async function generateReceiptPdf(payment, leadCourse, profile, business = BUSINESS) {
  return htmlToPdf(buildReceiptHtml(payment, leadCourse, profile, business));
}

/* ─── 2. GST Tax Invoice ─────────────────────────────────────────────────────── */

function buildInvoiceHtml(invoiceRecord, leadCourse, profile, payments, business = BUSINESS) {
  // Buyer (Bill To) details are frozen on the invoice record at issue time and
  // may be a custom billing entity (e.g. the lead's employer) rather than the
  // lead profile. Fall back to the profile for legacy invoices issued before
  // these fields existed.
  const isCustomBuyer = invoiceRecord.buyer_type === 'custom';
  const buyerBusinessName = invoiceRecord.buyer_name || (isCustomBuyer ? '' : profile.name) || 'Customer';
  // Contact person (the lead) — for a custom business buyer this is the lead;
  // for a profile buyer the buyer itself is the lead.
  const buyerContact = isCustomBuyer
    ? (invoiceRecord.buyer_contact_name || profile.name || '')
    : '';
  // Prominent name (party-name slot): the lead's name leads, the business name
  // drops to a line below it. Only show the business line when it differs.
  const billToName     = isCustomBuyer ? (buyerContact || buyerBusinessName) : buyerBusinessName;
  const billToBusiness = isCustomBuyer && buyerContact && buyerBusinessName ? buyerBusinessName : '';
  const buyerEmail   = invoiceRecord.buyer_email || (isCustomBuyer ? '' : profile.email) || '';
  const buyerGstin   = invoiceRecord.buyer_gstin || '';
  const buyerAddress = invoiceRecord.buyer_address || '';
  const buyerPhone   = isCustomBuyer
    ? (invoiceRecord.buyer_phone || phoneDisplay(profile))
    : phoneDisplay(profile);

  const cur    = leadCourse.currency || 'INR';
  const isINR  = cur === 'INR';
  const fmt    = (n) => formatAmount(n, cur);
  const gstPct = business.gstPercent != null ? business.gstPercent : 18;

  // Fee breakdown
  const coursePrice          = Number(leadCourse.course_price || 0);
  const platformDiscountPct  = Number(leadCourse.platform_discount_percent || 0);
  const platformDiscountAmt  = Math.round((coursePrice * platformDiscountPct) / 100);
  const agentDiscount        = Number(leadCourse.agent_discount_amount || 0);
  const totalDiscount        = platformDiscountAmt + agentDiscount;
  const gstAmount            = isINR ? Number(leadCourse.gst_amount || 0) : 0;
  const finalFee             = Number(leadCourse.final_fee || 0);
  const taxableAmount        = isINR ? finalFee - gstAmount : finalFee;

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const invoiceDate = invoiceRecord.created_at || invoiceRecord.createdAt || new Date();

  // Service table columns differ by currency
  const serviceHead = isINR
    ? `<th>Description of Service</th><th class="text-right">Rate</th><th class="text-right">Discount</th><th class="text-right">Taxable Value</th>`
    : `<th>Description of Service</th><th class="text-right">Rate</th><th class="text-right">Discount</th><th class="text-right">Amount</th>`;

  const discountCell = totalDiscount > 0
    ? `<span style="color:#16a34a">-${fmt(totalDiscount)}</span>`
    : '—';

  const serviceRow = isINR
    ? `<tr>
        <td><strong>${leadCourse.program_name}</strong></td>
        <td class="text-right">${fmt(coursePrice)}</td>
        <td class="text-right">${discountCell}</td>
        <td class="text-right">${fmt(taxableAmount)}</td>
       </tr>`
    : `<tr>
        <td><strong>${leadCourse.program_name}</strong></td>
        <td class="text-right">${fmt(coursePrice)}</td>
        <td class="text-right">${discountCell}</td>
        <td class="text-right">${fmt(finalFee)}</td>
       </tr>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
  <style>
    ${BASE_STYLES}
    @media print { .page-break { page-break-before: always; } }
    .page-break { page-break-before: always; }
    .gst-table { width: 340px; margin-left: auto; margin-bottom: 0; }
    .gst-table th, .gst-table td { padding: 8px 13px; }
  </style></head><body>

  ${headerBand('Tax Invoice', invoiceRecord.invoice_number, invoiceDate, business)}
  <div class="page-body">

  <div class="status-row">
    <span style="font-size:12px;color:#64748b;">
      Invoice Date: <strong>${formatDate(invoiceDate)}</strong>
      &nbsp;|&nbsp; Invoice No: <strong>${invoiceRecord.invoice_number}</strong>
    </span>
  </div>

  <div class="parties">
    <div class="party-box">
      <div class="party-label">Bill To (Buyer)</div>
      <div class="party-name">${billToName}</div>
      ${billToBusiness ? `<div class="party-detail" style="font-weight:600;color:#334155;">${billToBusiness}</div>` : ''}
      ${buyerAddress ? `<div class="party-detail">${buyerAddress.replace(/\n/g, '<br>')}</div>` : ''}
      ${buyerGstin ? `<div class="party-detail">GSTIN: ${buyerGstin}</div>` : ''}
      ${buyerEmail ? `<div class="party-detail">${buyerEmail}</div>` : ''}
      ${buyerPhone ? `<div class="party-detail">${buyerPhone}</div>` : ''}
    </div>
    <div class="party-box">
      <div class="party-label">Seller</div>
      <div class="party-name">${business.legalName || business.tradeName || ''}</div>
      ${business.email ? `<div class="party-detail">${business.email}</div>` : ''}
      ${business.gstin ? `<div class="party-detail">GSTIN: ${business.gstin}</div>` : ''}
    </div>
  </div>

  <p class="section-title">Service Details</p>
  <table>
    <thead><tr>${serviceHead}</tr></thead>
    <tbody>${serviceRow}</tbody>
  </table>

  ${isINR ? `
  <p class="section-title" style="margin-top:16px;">GST Breakup</p>
  <table class="gst-table">
    <thead>
      <tr><th>Component</th><th class="text-right">Rate</th><th class="text-right">Amount</th></tr>
    </thead>
    <tbody>
      <tr><td>Taxable Value</td><td></td><td class="text-right">${fmt(taxableAmount)}</td></tr>
      <tr><td>GST</td><td class="text-right">${gstPct}%</td><td class="text-right">${fmt(gstAmount)}</td></tr>
    </tbody>
  </table>` : ''}

  <div class="summary-box" style="margin-top:20px;">
    ${isINR ? `
    <div class="summary-row">
      <span>Taxable Value</span><span class="amount">${fmt(taxableAmount)}</span>
    </div>
    <div class="summary-row">
      <span>GST @ ${gstPct}%</span><span class="amount">${fmt(gstAmount)}</span>
    </div>` : ''}
    <div class="summary-row total">
      <span>Invoice Total</span><span class="amount">${fmt(finalFee)}</span>
    </div>
    <div class="summary-row" style="background:#f0fdf4;">
      <span style="color:#16a34a;font-weight:600;">Amount Paid</span>
      <span class="amount" style="color:#16a34a;">${fmt(totalPaid)}</span>
    </div>
    ${finalFee - totalPaid > 0.005 ? `
    <div class="summary-row" style="background:#fff7ed;">
      <span style="color:#ea580c;font-weight:600;">Balance Due</span>
      <span class="amount" style="color:#ea580c;">${fmt(finalFee - totalPaid)}</span>
    </div>` : ''}
  </div>

  </div><!-- /page-body -->

  ${footerHtml(business)}
  </body></html>`;
}

async function generateInvoicePdf(invoiceRecord, leadCourse, profile, payments, business = BUSINESS) {
  return htmlToPdf(buildInvoiceHtml(invoiceRecord, leadCourse, profile, payments, business));
}

/* ─── 3. Payment Statement ───────────────────────────────────────────────────── */

function buildStatementHtml(leadCourse, profile, payments, business = BUSINESS) {
  const buyerName  = profile.name  || 'Customer';
  const buyerEmail = profile.email || '';
  const cur = leadCourse.currency || 'INR';
  const fmt = (n) => formatAmount(n, cur);
  const stmtRef = `STMT-${leadCourse.id.slice(0, 8).toUpperCase()}`;

  const finalFee       = Number(leadCourse.final_fee || 0);
  const paidPayments   = payments.filter((p) => p.status === 'paid');
  const pendingPayments = payments.filter((p) => p.status !== 'paid');
  const totalPaid      = paidPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalPending   = pendingPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balanceDue     = Math.max(0, finalFee - totalPaid);
  const paidPercent    = finalFee > 0 ? Math.min(100, Math.round((totalPaid / finalFee) * 100)) : 0;

  const allRows = payments.map((p, i) => {
    const isPaid = p.status === 'paid';
    const statusCell = isPaid
      ? '<span class="badge badge-paid" style="font-size:10px;">Paid</span>'
      : '<span class="badge badge-pending" style="font-size:10px;">Pending</span>';
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${isPaid ? formatDate(p.paid_at) : '—'}</td>
        <td>${sourceLabel(p.source)}</td>
        <td>${p.reference || '—'}</td>
        <td>${p.description || '—'}</td>
        <td class="text-right amount">${fmt(p.amount)}</td>
        <td class="text-center">${statusCell}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
  <style>
    ${BASE_STYLES}
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
    .summary-card { border-radius: 10px; padding: 16px; text-align: center; }
    .summary-card.total { background: #f1f5f9; border: 1px solid #e2e8f0; }
    .summary-card.paid  { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .summary-card.due   { background: #fff7ed; border: 1px solid #fed7aa; }
    .summary-card .sc-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; }
    .summary-card.paid .sc-label { color: #15803d; }
    .summary-card.due  .sc-label { color: #c2410c; }
    .summary-card .sc-value { font-size: 18px; font-weight: 700; margin-top: 4px; color: #1e293b; }
    .summary-card.paid .sc-value { color: #16a34a; }
    .summary-card.due  .sc-value { color: #ea580c; }
    .progress-bar-outer { width: 100%; background: #f1f5f9; border-radius: 8px; height: 10px; margin: 6px 0 2px; overflow: hidden; }
    .progress-bar-inner { height: 100%; border-radius: 8px; background: linear-gradient(90deg, ${BRAND.blue}, ${BRAND.teal}); }
  </style></head><body>
  ${headerBand('Payment Statement', stmtRef, new Date(), business)}
  <div class="page-body">

  <div class="parties">
    <div class="party-box">
      <div class="party-label">Account Holder</div>
      <div class="party-name">${buyerName}</div>
      ${buyerEmail ? `<div class="party-detail">${buyerEmail}</div>` : ''}
      ${phoneDisplay(profile) ? `<div class="party-detail">${phoneDisplay(profile)}</div>` : ''}
    </div>
    <div class="party-box">
      <div class="party-label">Program Enrolled</div>
      <div class="party-name">${leadCourse.program_name}</div>
      ${leadCourse.cohort_name ? `<div class="party-detail">Batch: ${leadCourse.cohort_name}</div>` : ''}
      <div class="party-detail">Enrolled: ${formatDate(leadCourse.createdAt || leadCourse.created_at)}</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card total">
      <div class="sc-label">Total Fee</div>
      <div class="sc-value">${fmt(finalFee)}</div>
    </div>
    <div class="summary-card paid">
      <div class="sc-label">Paid</div>
      <div class="sc-value">${fmt(totalPaid)}</div>
    </div>
    <div class="summary-card due">
      <div class="sc-label">Balance Due</div>
      <div class="sc-value">${fmt(balanceDue)}</div>
    </div>
  </div>

  <div style="margin-bottom:24px;">
    <div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b;margin-bottom:4px;">
      <span>Payment progress</span>
      <span style="font-weight:600;color:${BRAND.blue};">${paidPercent}% paid</span>
    </div>
    <div class="progress-bar-outer">
      <div class="progress-bar-inner" style="width:${paidPercent}%;"></div>
    </div>
  </div>

  ${payments.length > 0 ? `
  <p class="section-title">Transaction History</p>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Date</th><th>Mode</th><th>Reference</th><th>Description</th>
        <th class="text-right">Amount</th><th class="text-center">Status</th>
      </tr>
    </thead>
    <tbody>${allRows}</tbody>
  </table>` : `
  <div style="text-align:center;padding:40px;color:#94a3b8;border:2px dashed #e2e8f0;border-radius:10px;">
    No payment transactions recorded yet.
  </div>`}

  ${totalPending > 0 ? `
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:16px;font-size:12px;color:#92400e;">
    <strong>Note:</strong> ${fmt(totalPending)} is in pending payment links (awaiting confirmation) and is not counted as paid.
  </div>` : ''}

  </div>
  ${footerHtml(business)}
  </body></html>`;
}

async function generateStatementPdf(leadCourse, profile, payments, business = BUSINESS) {
  return htmlToPdf(buildStatementHtml(leadCourse, profile, payments, business));
}

/* ─── Email HTML bodies ──────────────────────────────────────────────────────── */

/** Shared email header band: logo + trade name, with the document type below. */
function emailHeaderBand(docType, business = BUSINESS) {
  const brand = business.tradeName || business.legalName || '';
  const logo = business.logo || '';
  const nameTag = brand
    ? `<td style="vertical-align:middle;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">${brand}</td>`
    : '';
  const brandTop = logo
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
         <td style="vertical-align:middle;padding-right:10px;"><img src="${logo}" alt="${brand}" height="34" style="display:block;height:34px;width:auto;border-radius:6px;" /></td>
         ${nameTag}
       </tr></table>`
    : (brand ? `<div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">${brand}</div>` : '');

  return `
    <div style="background:${BRAND.blueBg};padding:24px 32px;">
      ${brandTop}
      <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:8px;">${docType}</div>
    </div>`;
}

/** Shared email footer: contact details (email · phone), with brand · website below. */
function emailFooterBand(business = BUSINESS) {
  const contact = [business.email, business.phone].filter(Boolean).join(' · ');
  const brand = [business.tradeName, business.website].filter(Boolean).join(' · ');
  if (!contact && !brand) return '';
  return `
    <div style="background:#f8fafc;padding:16px 32px;text-align:center;font-size:11px;color:#94a3b8;border-top:2px solid ${BRAND.blue};">
      ${contact ? `<div style="color:#64748b;">${contact}</div>` : ''}
      ${brand ? `<div style="margin-top:4px;">${brand}</div>` : ''}
    </div>`;
}

function buildReceiptEmailHtml(payment, leadCourse, profile, business = BUSINESS) {
  const buyerName = profile.name || 'Customer';
  const cur = leadCourse.currency || 'INR';
  const amount = Number(payment.amount || 0);
  const src = payment.source;

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    ${emailHeaderBand('Payment Receipt', business)}
    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#1e293b;">Hi ${buyerName},</p>
      <p style="margin-top:10px;color:#475569;line-height:1.6;">
        We have received your payment of <strong>${formatAmount(amount, cur)}</strong> for <strong>${leadCourse.program_name}</strong>.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="color:#64748b;padding:4px 0;">Amount</td><td style="font-weight:600;text-align:right;">${formatAmount(amount, cur)}</td></tr>
          <tr><td style="color:#64748b;padding:4px 0;">Mode</td><td style="font-weight:600;text-align:right;">${sourceLabel(src)}</td></tr>
          ${payment.reference ? `<tr><td style="color:#64748b;padding:4px 0;">Reference</td><td style="font-weight:600;text-align:right;">${payment.reference}</td></tr>` : ''}
          <tr><td style="color:#64748b;padding:4px 0;">Date</td><td style="font-weight:600;text-align:right;">${formatDateTime(payment.paid_at)}</td></tr>
        </table>
      </div>
      <p style="color:#64748b;font-size:12px;line-height:1.6;">
        A detailed PDF receipt is attached to this email. Please retain it for your records.
      </p>
    </div>
    ${emailFooterBand(business)}
  </div>`;
}

function buildInvoiceEmailHtml(invoiceRecord, leadCourse, profile, business = BUSINESS) {
  const buyerName = invoiceRecord.buyer_name || profile.name || 'Customer';
  const cur = leadCourse.currency || 'INR';
  const finalFee = Number(leadCourse.final_fee || 0);
  const invoiceDate = invoiceRecord.created_at || invoiceRecord.createdAt || new Date();

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    ${emailHeaderBand('GST Tax Invoice', business)}
    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#1e293b;">Hi ${buyerName},</p>
      <p style="margin-top:10px;color:#475569;line-height:1.6;">
        Please find attached the Tax Invoice for your enrollment in <strong>${leadCourse.program_name}</strong>.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="color:#64748b;padding:4px 0;">Invoice Number</td><td style="font-weight:600;text-align:right;">${invoiceRecord.invoice_number}</td></tr>
          <tr><td style="color:#64748b;padding:4px 0;">Invoice Date</td><td style="font-weight:600;text-align:right;">${formatDate(invoiceDate)}</td></tr>
          <tr><td style="color:#64748b;padding:4px 0;">Program</td><td style="font-weight:600;text-align:right;">${leadCourse.program_name}</td></tr>
          <tr><td style="color:#64748b;padding:4px 0;">Invoice Total</td><td style="font-weight:700;text-align:right;font-size:15px;color:${BRAND.blue};">${formatAmount(finalFee, cur)}</td></tr>
        </table>
      </div>
      <p style="color:#64748b;font-size:12px;line-height:1.6;">
        The attached invoice is an official tax document. Please save it for your records.
      </p>
    </div>
    ${emailFooterBand(business)}
  </div>`;
}

/* ─── Document previews (sample data for Business Settings) ──────────────────── */

/** Realistic dummy data so an admin can see how documents look with their branding. */
function samplePreviewData(business = BUSINESS) {
  const now = new Date();
  const profile = {
    name: 'Aanya Sharma',
    email: 'aanya.sharma@example.com',
    phone: '9988776655',
    country_code: '+91',
  };
  const finalFee = 45000;
  const gstPct = business.gstPercent != null ? business.gstPercent : 18;
  const gstAmount = Math.round(finalFee - finalFee / (1 + gstPct / 100));
  const leadCourse = {
    id: 'SAMPLE00-PREVIEW-0000-000000000000',
    program_name: 'AI PM Fellowship',
    cohort_name: 'Cohort 7',
    currency: 'INR',
    course_price: 50000,
    platform_discount_percent: 10,
    agent_discount_amount: 0,
    gst_amount: gstAmount,
    final_fee: finalFee,
    created_at: now,
  };
  const paidPayment = {
    id: 'PAYMENT0-PREVIEW-0000-000000000000',
    amount: 25000,
    source: 'razorpay',
    reference: 'pay_SAMPLE1234567',
    description: 'Course fee — Installment 1',
    paid_at: now,
    status: 'paid',
  };
  const pendingPayment = {
    id: 'PAYMENT1-PREVIEW-0000-000000000000',
    amount: 20000,
    source: 'bank_transfer',
    reference: '',
    description: 'Course fee — Installment 2',
    paid_at: null,
    status: 'pending',
  };
  const invoiceRecord = {
    invoice_number: formatInvoiceNumber(1, business.invoicePrefix),
    created_at: now,
  };
  return { profile, leadCourse, paidPayment, pendingPayment, invoiceRecord };
}

/** Render a sample receipt / invoice / statement PDF for the given business config. */
async function generatePreviewPdf(type, business = BUSINESS) {
  const { profile, leadCourse, paidPayment, pendingPayment, invoiceRecord } =
    samplePreviewData(business);
  switch (type) {
    case 'invoice':
      return htmlToPdf(buildInvoiceHtml(invoiceRecord, leadCourse, profile, [paidPayment], business));
    case 'statement':
      return htmlToPdf(buildStatementHtml(leadCourse, profile, [paidPayment, pendingPayment], business));
    case 'receipt':
    default:
      return htmlToPdf(buildReceiptHtml(paidPayment, leadCourse, profile, business));
  }
}

module.exports = {
  generateReceiptPdf,
  generateInvoicePdf,
  generateStatementPdf,
  generatePreviewPdf,
  buildReceiptEmailHtml,
  buildInvoiceEmailHtml,
};
