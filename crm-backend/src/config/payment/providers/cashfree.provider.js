/**
 * Cashfree payment provider.
 *
 * Implements the common provider interface (see ./index.js), wrapping the
 * Cashfree SDK helper in ../cashfree.js.
 *
 * Currency support: Cashfree hosted Payment Links are INR-only on a standard
 * account (cross-border acceptance is a separate Cashfree product). So this
 * provider advertises INR only — flip `supportedCurrencies` once Cashfree
 * Global is integrated.
 */
const cashfree = require("../cashfree");
const { GatewayError } = require("../gatewayError");
const { PAYMENT_STATUS } = require("../../constants/payment");
const { CASHFREE_PAYMENT_LINK_STATUS } = require("../../constants/payment");

const KEY = "cashfree";
const LABEL = "Cashfree";

// Cashfree's own supported-currency list. Hosted Payment Links are INR-only on
// a standard account; the real cross-border list will be filled in when
// Cashfree Global is integrated.
const CASHFREE_CURRENCIES = ["INR"];

function supportedCurrencies() {
  return CASHFREE_CURRENCIES;
}

function supportsCurrency(currency) {
  return CASHFREE_CURRENCIES.includes(String(currency || "").toUpperCase());
}

async function createLink({ payment, leadProfile, amount, currency, description, expiry }) {
  // Cashfree requires a customer phone on the link.
  if (!leadProfile.phone) {
    throw new Error("Customer phone is required to generate a Cashfree payment link");
  }

  // Cashfree amounts are in major units (rupees), not subunits. The merchant
  // link_id is the Payment id so the webhook maps straight back.
  const request = {
    link_id: payment.id,
    link_amount: Number(amount),
    link_currency: String(currency).toUpperCase(),
    link_purpose: description || "Course payment",
    customer_details: {
      customer_name: leadProfile.name,
      customer_phone: leadProfile.phone,
      customer_email: leadProfile.email,
    },
    link_notify: { send_sms: true, send_email: true },
    link_notes: {
      payment_id: payment.id,
      lead_profile_id: payment.lead_profile_id ? String(payment.lead_profile_id) : "",
      lead_course_id: payment.lead_course_id ? String(payment.lead_course_id) : "",
    },
  };

  if (expiry) {
    request.link_expiry_time = new Date(expiry).toISOString();
  }

  const link = await cashfree.createLink(request);

  return {
    // cancel uses the merchant link_id (= payment.id), echoed back as link_id.
    providerLinkId: link.link_id ? String(link.link_id) : payment.id,
    shortUrl: link.link_url,
    status: link.link_status
      ? String(link.link_status).toLowerCase()
      : CASHFREE_PAYMENT_LINK_STATUS.ACTIVE,
    expireBy: link.link_expiry_time ? new Date(link.link_expiry_time) : null,
    raw: link,
  };
}

/**
 * Translate a Cashfree SDK rejection into a GatewayError.
 *
 * The SDK is a thin axios wrapper, so the rejection's own `message` is the
 * generic "Request failed with status code 400" — the real reason lives in
 * `response.data.message` / `.code`.
 */
function toGatewayError(err, { cancelling = false } = {}) {
  const body = (err && err.response && err.response.data) || null;
  const message =
    (body && body.message) || (err && err.message) || "Cashfree rejected the request";
  const code = body && body.code ? body.code : null;

  return new GatewayError(message, {
    provider: KEY,
    code,
    statusCode: (err && err.response && err.response.status) || null,
    // Cashfree only cancels ACTIVE links; a lapsed or settled one comes back as
    // link_not_active.
    notCancellable: cancelling && /link_not_active|not\s+active|already/i.test(`${code} ${message}`),
  });
}

async function cancelLink(providerLinkId) {
  try {
    await cashfree.cancelLink(providerLinkId);
  } catch (err) {
    throw toGatewayError(err, { cancelling: true });
  }
}

/**
 * Read the link's CURRENT state at Cashfree.
 *
 * Load-bearing here in a way it isn't for Razorpay: when no expiry is supplied
 * Cashfree applies its own default (30 days) and then lets the link lapse into
 * EXPIRED *silently* — no PAYMENT_LINK_EVENT is emitted for passive expiry — so
 * a webhook alone can never correct our copy. Asking is the only way to know.
 *
 * Returns the raw link_status lowercased: active / paid / partially_paid /
 * expired / cancelled.
 */
async function fetchLink(providerLinkId) {
  try {
    const link = await cashfree.fetchLink(providerLinkId);
    return {
      status: String(link.link_status || "").toLowerCase(),
      raw: link,
    };
  } catch (err) {
    throw toGatewayError(err);
  }
}

function verifyWebhook(req, rawBody) {
  const signature = req.headers["x-webhook-signature"];
  const timestamp = req.headers["x-webhook-timestamp"];
  return cashfree.verifyWebhook(signature, rawBody, timestamp);
}

/**
 * Map a Cashfree webhook body to a normalized payment event.
 *
 * Cashfree sends both link-lifecycle events (PAYMENT_LINK_EVENT, ids under
 * data.link_id) and order-level events (PAYMENT_FAILED_WEBHOOK, ids under
 * data.order.order_tags — Cashfree maps our link_notes → order_tags). A failed
 * attempt only flips a *pending* Payment; a later PAID/EXPIRED/CANCELLED wins.
 */
function parseWebhook(body) {
  const type = body.type;
  const data = body.data || {};

  if (type === "PAYMENT_FAILED_WEBHOOK") {
    const tags = data.order?.order_tags || {};
    const paymentId = tags.payment_id || tags.link_id;
    if (!paymentId) return null;
    return {
      provider: KEY,
      paymentId,
      status: PAYMENT_STATUS.FAILED,
      note:
        data.payment?.payment_message ||
        data.error_details?.error_description ||
        null,
      raw: body,
    };
  }

  // Non-link, non-failure events (PAYMENT_SUCCESS / USER_DROPPED) are no-ops:
  // success is recorded via the PAYMENT_LINK_EVENT PAID status.
  if (type && type !== "PAYMENT_LINK_EVENT") return null;

  const linkId = data.link_id;
  const linkStatus = String(data.link_status || "").toUpperCase();
  if (!linkId) return null;
  // Preserve the test-link skip guard.
  if (linkId === "payment_ps11") return null;

  switch (linkStatus) {
    case "PAID":
      return {
        provider: KEY,
        paymentId: linkId,
        status: PAYMENT_STATUS.PAID,
        paidAt: body.event_time ? new Date(body.event_time) : new Date(),
        baseCurrency: "INR", // Cashfree links are INR
        providerRef: data.payment?.cf_payment_id || data.order?.order_id || null,
        linkStatus: CASHFREE_PAYMENT_LINK_STATUS.PAID,
        raw: body,
      };
    case "EXPIRED":
      return {
        provider: KEY,
        paymentId: linkId,
        status: PAYMENT_STATUS.EXPIRED,
        linkStatus: CASHFREE_PAYMENT_LINK_STATUS.EXPIRED,
        raw: body,
      };
    case "CANCELLED":
      return {
        provider: KEY,
        paymentId: linkId,
        status: PAYMENT_STATUS.CANCELLED,
        linkStatus: CASHFREE_PAYMENT_LINK_STATUS.CANCELLED,
        raw: body,
      };
    case "PARTIALLY_PAID":
      // Partial payments are disabled on our links; record link status only,
      // leave the Payment pending (status: null → service skips the Payment).
      return {
        provider: KEY,
        paymentId: linkId,
        status: null,
        linkStatus: CASHFREE_PAYMENT_LINK_STATUS.PARTIALLY_PAID,
        raw: body,
      };
    default:
      return null;
  }
}

module.exports = {
  key: KEY,
  label: LABEL,
  supportedCurrencies,
  supportsCurrency,
  createLink,
  cancelLink,
  fetchLink,
  verifyWebhook,
  parseWebhook,
};
