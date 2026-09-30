'use strict';

const {
  Payment,
  PaymentLink,
  LeadCourse,
  LeadProfile,
  Invoice,
  sequelize,
} = require('../models');
const { PAYMENT_STATUS } = require('../config/constants/payment');
const { ENROLLMENT_STATUS } = require('../config/constants/enrollment');
const {
  currentFinancialYearLabel,
  financialYearLabelFor,
  formatInvoiceNumber,
} = require('../config/business');
const {
  generateReceiptPdf,
  generateInvoicePdf,
  generateStatementPdf,
  buildReceiptEmailHtml,
  buildInvoiceEmailHtml,
} = require('../services/pdf.service');
const { sendEmail } = require('../services/email.service');
const { getBusinessConfig } = require('../services/businessSettings.service');
const { assertLeadCourseInScope, assertPaymentInScope } = require('../utils/documentScope');

/* ─── Shared: fetch full course data ────────────────────────────────────────── */

async function fetchCourseWithProfile(leadCourseId) {
  const course = await LeadCourse.findByPk(leadCourseId, {
    include: [
      { model: LeadProfile, as: 'LeadProfile', attributes: ['id', 'name', 'email', 'phone', 'country_code'] },
    ],
  });
  if (!course) throw Object.assign(new Error('Enrollment not found'), { statusCode: 404 });
  const profile = course.LeadProfile;
  if (!profile) throw Object.assign(new Error('Profile not found for this enrollment'), { statusCode: 404 });
  return { course: course.toJSON(), profile: profile.toJSON() };
}

async function fetchPaidPaymentsForCourse(leadCourseId) {
  return Payment.findAll({
    where: { lead_course_id: leadCourseId, status: PAYMENT_STATUS.PAID },
    order: [['paid_at', 'ASC']],
    raw: true,
  });
}

async function fetchAllPaymentsForCourse(leadCourseId) {
  return Payment.findAll({
    where: { lead_course_id: leadCourseId },
    include: [{ model: PaymentLink, as: 'Link', attributes: ['status'] }],
    order: [['created_at', 'ASC']],
  }).then((rows) =>
    rows.map((r) => {
      const p = r.toJSON();
      // Flatten link status for statement display
      if (p.Link) {
        p.status = p.Link.status === 'paid' ? PAYMENT_STATUS.PAID : p.status;
      }
      return p;
    }),
  );
}

/* ─── Invoice record helpers ───────────────────────────────────────────────── */

/** Returns the issued invoice for an enrollment, or null if not yet issued. */
async function findInvoice(leadCourseId) {
  const existing = await Invoice.findOne({ where: { lead_course_id: leadCourseId } });
  return existing ? existing.toJSON() : null;
}

/** Total of all PAID payments on an enrollment (used to gate issuing). */
async function totalPaidForCourse(leadCourseId) {
  const payments = await fetchPaidPaymentsForCourse(leadCourseId);
  return payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

/**
 * Create the invoice record for an enrollment, freezing the chosen buyer
 * (billing) details. `buyer` carries either the lead profile's details
 * (buyer_type 'profile') or a custom entity's details (buyer_type 'custom').
 * Allocates the next sequential number for the financial year under a lock so
 * concurrent issues can't collide on a sequence.
 */
async function createInvoiceRecord(leadCourseId, userId, course, buyer, business, invoiceDate) {
  // Honour a custom (back-dated) invoice date. The FY — which drives both the
  // per-year sequence bucket and the FY segment of the number — is derived from
  // that date so the invoice number stays consistent with its printed date.
  const issueDate =
    invoiceDate instanceof Date && !Number.isNaN(invoiceDate.getTime())
      ? invoiceDate
      : null;
  const fy = issueDate ? financialYearLabelFor(issueDate) : currentFinancialYearLabel();

  const invoiceRecord = await sequelize.transaction(async (t) => {
    const maxRow = await Invoice.findOne({
      where: { financial_year: fy },
      order: [['sequence', 'DESC']],
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    const sequence = (maxRow ? maxRow.sequence : 0) + 1;
    const invoiceNumber = formatInvoiceNumber(sequence, business?.invoicePrefix, fy);

    return Invoice.create(
      {
        sequence,
        invoice_number: invoiceNumber,
        financial_year: fy,
        lead_course_id: leadCourseId,
        generated_by: userId || null,
        buyer_type: buyer.type === 'custom' ? 'custom' : 'profile',
        buyer_name: buyer.name || null,
        buyer_email: buyer.email || null,
        buyer_gstin: buyer.gstin || null,
        buyer_contact_name: buyer.contactName || null,
        buyer_address: buyer.address || null,
        buyer_phone: buyer.phone || null,
        // Frozen like the buyer details above. The enrollment's cohort can move
        // afterwards (a deferral), and an issued tax document must not silently
        // start printing a different batch than the one it was issued for.
        cohort_name: course.cohort_name || null,
        total_amount: Math.round(Number(course.final_fee || 0)),
        taxable_amount: Math.round(Number(course.final_fee || 0) - Number(course.gst_amount || 0)),
        gst_amount: Math.round(Number(course.gst_amount || 0)),
        // Sequelize keeps an explicitly-provided timestamp instead of NOW. Both
        // spellings are set to survive the underscored timestamp attribute name.
        ...(issueDate ? { created_at: issueDate, createdAt: issueDate } : {}),
      },
      { transaction: t },
    );
  });

  return invoiceRecord.toJSON();
}

/* ─── Issue Invoice (explicit, with chosen buyer details) ───────────────────── */

exports.issueInvoice = async (req, res) => {
  try {
    const { leadCourseId } = req.params;
    const { buyerType, buyerName, buyerEmail, buyerGstin, buyerContactName, buyerAddress, buyerPhone, invoiceDate } = req.body || {};

    // Optional custom invoice date (back-dating). Ignore invalid/future values.
    let invoiceDateValue = null;
    if (invoiceDate) {
      const parsed = new Date(invoiceDate);
      if (!Number.isNaN(parsed.getTime())) {
        if (parsed.getTime() > Date.now()) {
          return res.status(400).json({ success: false, message: 'Invoice date cannot be in the future.' });
        }
        invoiceDateValue = parsed;
      }
    }

    await assertLeadCourseInScope(req.user, leadCourseId);

    const { course, profile } = await fetchCourseWithProfile(leadCourseId);

    // No NEW invoice on a dropped enrollment. An invoice already issued stays
    // valid and downloadable — a GST document needs a credit note, not a
    // deletion — so only issuance is blocked here.
    if (course.status === ENROLLMENT_STATUS.DROPPED) {
      return res.status(409).json({
        success: false,
        message: 'This enrollment has been dropped — a new invoice cannot be issued.',
        code: 'ENROLLMENT_DROPPED',
      });
    }

    // Only issue once an enrollment is fully paid (matches the UI gate).
    const totalPaid = await totalPaidForCourse(leadCourseId);
    if (totalPaid < Number(course.final_fee || 0)) {
      return res.status(400).json({ success: false, message: 'Invoice can only be issued after full payment.' });
    }

    const existing = await findInvoice(leadCourseId);
    if (existing) {
      return res.status(409).json({ success: false, message: `Invoice ${existing.invoice_number} has already been issued for this enrollment.` });
    }

    const isCustom = buyerType === 'custom';
    let buyer;
    if (isCustom) {
      if (!buyerName || !String(buyerName).trim()) {
        return res.status(400).json({ success: false, message: 'Buyer name is required for a custom billing entity.' });
      }
      buyer = {
        type: 'custom',
        name: String(buyerName).trim(),
        email: buyerEmail ? String(buyerEmail).trim() : null,
        gstin: buyerGstin ? String(buyerGstin).trim() : null,
        // Default the contact person to the lead's own name when not overridden.
        contactName: (buyerContactName && String(buyerContactName).trim()) || profile.name || null,
        address: buyerAddress ? String(buyerAddress).trim() : null,
        phone: buyerPhone ? String(buyerPhone).trim() : null,
      };
    } else {
      buyer = { type: 'profile', name: profile.name || null, email: profile.email || null };
    }

    const business = await getBusinessConfig();
    const invoiceRecord = await createInvoiceRecord(leadCourseId, req.user?.id, course, buyer, business, invoiceDateValue);

    res.json({
      success: true,
      message: `Invoice ${invoiceRecord.invoice_number} issued`,
      data: { invoice: invoiceRecord },
    });
  } catch (err) {
    console.error('[document] issueInvoice error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to issue invoice' });
  }
};

/* ─── 1. Download Payment Receipt ───────────────────────────────────────────── */

exports.downloadReceipt = async (req, res) => {
  try {
    const { paymentId } = req.params;

    await assertPaymentInScope(req.user, paymentId);

    const payment = await Payment.findByPk(paymentId, { raw: true });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.status !== PAYMENT_STATUS.PAID) {
      return res.status(400).json({ success: false, message: 'Receipt is only available for paid payments' });
    }
    if (!payment.lead_course_id) {
      return res.status(400).json({ success: false, message: 'This payment is not linked to a course enrollment' });
    }

    const { course, profile } = await fetchCourseWithProfile(payment.lead_course_id);
    const business = await getBusinessConfig();

    const pdf = await generateReceiptPdf(payment, course, profile, business);

    const fileName = `Receipt-${payment.id.slice(0, 8).toUpperCase()}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (err) {
    console.error('[document] downloadReceipt error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to generate receipt' });
  }
};

/* ─── 2. Send Receipt via Email ─────────────────────────────────────────────── */

exports.sendReceipt = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { buyerName, buyerEmail } = req.body || {};

    await assertPaymentInScope(req.user, paymentId);

    const payment = await Payment.findByPk(paymentId, { raw: true });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.status !== PAYMENT_STATUS.PAID) {
      return res.status(400).json({ success: false, message: 'Receipt is only available for paid payments' });
    }
    if (!payment.lead_course_id) {
      return res.status(400).json({ success: false, message: 'This payment is not linked to a course enrollment' });
    }

    const { course, profile } = await fetchCourseWithProfile(payment.lead_course_id);
    const recipientEmail = buyerEmail || profile.email;
    const recipientName = buyerName || profile.name;

    if (!recipientEmail) {
      return res.status(400).json({ success: false, message: 'No email address found on the lead profile.' });
    }

    const business = await getBusinessConfig();
    const profileForPdf = { ...profile, name: recipientName };
    const [pdf, htmlBody] = await Promise.all([
      generateReceiptPdf(payment, course, profileForPdf, business),
      Promise.resolve(buildReceiptEmailHtml(payment, course, profileForPdf, business)),
    ]);

    const receiptNumber = `RCPT-${payment.id.slice(0, 8).toUpperCase()}`;

    await sendEmail({
      to: recipientEmail,
      subject: `Payment Receipt ${receiptNumber} — ${course.program_name}`,
      html: htmlBody,
      attachments: [
        {
          filename: `Receipt-${receiptNumber}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });

    res.json({ success: true, message: `Receipt sent to ${recipientEmail}` });
  } catch (err) {
    console.error('[document] sendReceipt error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to send receipt' });
  }
};

/* ─── 3. Download GST Invoice ───────────────────────────────────────────────── */

exports.downloadInvoice = async (req, res) => {
  try {
    const { leadCourseId } = req.params;

    await assertLeadCourseInScope(req.user, leadCourseId);

    const { course, profile } = await fetchCourseWithProfile(leadCourseId);

    const invoiceRecord = await findInvoice(leadCourseId);
    if (!invoiceRecord) {
      return res.status(400).json({ success: false, message: 'Invoice has not been issued yet for this enrollment.' });
    }

    const payments = await fetchPaidPaymentsForCourse(leadCourseId);
    const business = await getBusinessConfig();
    const pdf = await generateInvoicePdf(invoiceRecord, course, profile, payments, business);

    const fileName = `Invoice-${invoiceRecord.invoice_number.replace(/\//g, '-')}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (err) {
    console.error('[document] downloadInvoice error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to generate invoice' });
  }
};

/* ─── 4. Send GST Invoice via Email ─────────────────────────────────────────── */

exports.sendInvoice = async (req, res) => {
  try {
    const { leadCourseId } = req.params;
    // buyerEmail here is the delivery address only — the invoice's billed buyer
    // is frozen at issue time and is not editable from the send dialog.
    const { buyerEmail } = req.body || {};

    await assertLeadCourseInScope(req.user, leadCourseId);

    const { course, profile } = await fetchCourseWithProfile(leadCourseId);

    const invoiceRecord = await findInvoice(leadCourseId);
    if (!invoiceRecord) {
      return res.status(400).json({ success: false, message: 'Invoice has not been issued yet for this enrollment.' });
    }

    const recipientEmail = buyerEmail || invoiceRecord.buyer_email || profile.email;
    if (!recipientEmail) {
      return res.status(400).json({ success: false, message: 'No email address available. Add a recipient email or set one on the profile.' });
    }

    const payments = await fetchPaidPaymentsForCourse(leadCourseId);
    const business = await getBusinessConfig();

    const [pdf, htmlBody] = await Promise.all([
      generateInvoicePdf(invoiceRecord, course, profile, payments, business),
      Promise.resolve(buildInvoiceEmailHtml(invoiceRecord, course, profile, business)),
    ]);

    const fileName = `Invoice-${invoiceRecord.invoice_number.replace(/\//g, '-')}.pdf`;

    await sendEmail({
      to: recipientEmail,
      subject: `Tax Invoice ${invoiceRecord.invoice_number} — ${course.program_name}`,
      html: htmlBody,
      attachments: [
        {
          filename: `${fileName}`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });

    res.json({ success: true, message: `Invoice ${invoiceRecord.invoice_number} sent to ${recipientEmail}` });
  } catch (err) {
    console.error('[document] sendInvoice error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to send invoice' });
  }
};

/* ─── 5. Download Payment Statement ─────────────────────────────────────────── */

exports.downloadStatement = async (req, res) => {
  try {
    const { leadCourseId } = req.params;

    await assertLeadCourseInScope(req.user, leadCourseId);

    const { course, profile } = await fetchCourseWithProfile(leadCourseId);
    const payments = await fetchAllPaymentsForCourse(leadCourseId);
    const business = await getBusinessConfig();
    const pdf = await generateStatementPdf(course, profile, payments, business);

    const fileName = `Statement-${leadCourseId.slice(0, 8).toUpperCase()}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (err) {
    console.error('[document] downloadStatement error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to generate statement' });
  }
};

/* ─── 6. Get invoice info for an enrollment ─────────────────────────────────── */

exports.getInvoiceInfo = async (req, res) => {
  try {
    const { leadCourseId } = req.params;

    await assertLeadCourseInScope(req.user, leadCourseId);

    const course = await LeadCourse.findByPk(leadCourseId, {
      attributes: ['id', 'program_name', 'final_fee', 'gst_amount'],
      include: [
        {
          model: Invoice,
          as: 'Invoice',
          attributes: [
            'id', 'invoice_number', 'created_at',
            'buyer_type', 'buyer_name', 'buyer_email', 'buyer_gstin', 'buyer_contact_name', 'buyer_address', 'buyer_phone',
          ],
        },
        { model: LeadProfile, as: 'LeadProfile', attributes: ['name', 'email'] },
      ],
    });

    if (!course) return res.status(404).json({ success: false, message: 'Enrollment not found' });

    res.json({
      success: true,
      data: {
        buyer_name: course.LeadProfile?.name || null,
        buyer_email: course.LeadProfile?.email || null,
        invoice: course.Invoice || null,
      },
    });
  } catch (err) {
    console.error('[document] getInvoiceInfo error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to fetch invoice info' });
  }
};
