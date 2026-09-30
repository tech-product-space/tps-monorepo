/**
 * Razorpay payment provider.
 *
 * Implements the common provider interface (see ./index.js). All Razorpay
 * SDK + webhook specifics live here so the payment service and webhook handler
 * stay gateway-agnostic.
 *
 *   createLink   → normalized { providerLinkId, shortUrl, status, expireBy, raw }
 *   cancelLink   → void
 *   verifyWebhook(req, rawBody) → boolean
 *   parseWebhook(body) → normalized payment event | null
 */
const crypto = require("crypto");
const razorpay = require("../razorpay");
const { GatewayError } = require("../gatewayError");
const { toSubunit } = require("../../constants/currency");
const { PAYMENT_STATUS } = require("../../constants/payment");

const KEY = "razorpay";
const LABEL = "Razorpay";

// Currencies Razorpay can accept (Razorpay's own supported-currency list).
// This list is provider-specific — Cashfree and any future gateway declare
// their own. The per-currency decimal behaviour (exponent) is ISO-standard and
// lives in config/constants/currency.js, shared by all providers.
const RAZORPAY_CURRENCIES = [
  "AED", "ALL", "AMD", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB",
  "BRL", "BSD", "BTN", "BWP", "BZD",
  "CAD", "CHF", "CLP", "CNY", "COP", "CRC", "CUP", "CVE", "CZK",
  "DJF", "DKK", "DOP", "DZD",
  "EGP", "ETB", "EUR",
  "FJD",
  "GBP", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD",
  "HKD", "HNL", "HRK", "HTG", "HUF",
  "IDR", "ILS", "INR", "IQD", "ISK",
  "JMD", "JOD", "JPY",
  "KES", "KGS", "KHR", "KMF", "KRW", "KWD", "KYD", "KZT",
  "LAK", "LKR", "LRD", "LSL",
  "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MUR", "MVR",
  "MWK", "MXN", "MYR",
  "NAD", "NGN", "NIO", "NOK", "NPR", "NZD",
  "OMR",
  "PEN", "PGK", "PHP", "PKR", "PLN", "PYG",
  "QAR",
  "RON", "RSD", "RUB", "RWF",
  "SAR", "SCR", "SEK", "SGD", "SLL", "SOS", "SSP", "SVC", "SZL",
  "THB", "TND", "TRY", "TTD", "TWD", "TZS",
  "UAH", "UGX", "USD", "UYU", "UZS",
  "VND", "VUV",
  "XAF", "XCD", "XOF", "XPF",
  "YER",
  "ZAR", "ZMW",
];

// The optional RAZORPAY_ENABLED_CURRENCIES env (comma-separated ISO codes)
// narrows the list to what's actually activated on the account — no code change.
function supportedCurrencies() {
  const override = (process.env.RAZORPAY_ENABLED_CURRENCIES || "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (override.length === 0) return RAZORPAY_CURRENCIES;
  const allowed = new Set(RAZORPAY_CURRENCIES);
  return override.filter((c) => allowed.has(c));
}

function supportsCurrency(currency) {
  return supportedCurrencies().includes(String(currency || "").toUpperCase());
}

async function createLink({ payment, leadProfile, amount, currency, description, expiry, offerId }) {
  const payload = {
    amount: toSubunit(amount, currency),
    currency: String(currency).toUpperCase(),
    description,
    reference_id: payment.id,
    customer: {
      name: leadProfile.name,
      email: leadProfile.email,
      contact: leadProfile.phone,
    },
    notify: { sms: true, email: true },
  };

  // Razorpay expects a unix timestamp (seconds) for expiry.
  if (expiry) {
    payload.expire_by = Math.floor(new Date(expiry).getTime() / 1000);
  }
  if (offerId) {
    payload.offer_id = offerId;
  }

  const link = await razorpay.paymentLink.create(payload);

  return {
    providerLinkId: link.id,
    shortUrl: link.short_url,
    status: link.status, // 'created'
    expireBy: link.expire_by ? new Date(link.expire_by * 1000) : null,
    raw: link,
  };
}

/**
 * Translate a Razorpay SDK rejection into a GatewayError.
 *
 * The SDK's own `normalizeError` throws `{ statusCode, error: {...} }` — a bare
 * object, not an Error — so the description below is the ONLY human-readable
 * account of what went wrong, and it was previously discarded.
 */
function toGatewayError(err, { cancelling = false } = {}) {
  const body = err && err.error ? err.error : null;
  const description =
    (body && body.description) ||
    (typeof err === "string" ? err : null) ||
    (err && err.message) ||
    "Razorpay rejected the request";

  return new GatewayError(description, {
    provider: KEY,
    code: body && body.code ? body.code : null,
    statusCode: err && err.statusCode ? err.statusCode : null,
    // Razorpay only cancels links still in `created` state; anything already
    // paid, expired or cancelled comes back as this validation failure.
    notCancellable:
      cancelling && /not in created state|already (been )?(cancelled|canceled|paid|expired)/i.test(description),
  });
}

async function cancelLink(providerLinkId) {
  try {
    await razorpay.paymentLink.cancel(providerLinkId);
  } catch (err) {
    throw toGatewayError(err, { cancelling: true });
  }
}

/**
 * Read the link's CURRENT state at Razorpay.
 *
 * Nothing else does this — our copy of a link's status is only ever moved by an
 * inbound webhook, so a missed or unsubscribed event leaves the row stuck on
 * `pending` forever. This is the escape hatch: ask the gateway directly.
 *
 * Returns the raw Razorpay status lowercased — created / paid / partially_paid
 * / expired / cancelled.
 */
async function fetchLink(providerLinkId) {
  try {
    const link = await razorpay.paymentLink.fetch(providerLinkId);
    return {
      status: String(link.status || "").toLowerCase(),
      raw: link,
    };
  } catch (err) {
    throw toGatewayError(err);
  }
}

function verifyWebhook(req, rawBody) {
  const signature = req.headers["x-razorpay-signature"];
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}

/**
 * Map a Razorpay webhook body to a normalized payment event.
 * Returns null for events we don't act on.
 *
 * For international payments the payment entity carries `base_amount` /
 * `base_currency` (the INR settlement) plus `fee` / `tax` in the base
 * currency — captured here so the service can store settlement values.
 */
function parseWebhook(body) {
  const event = body.event;

  if (event === "payment_link.paid") {
    const link = body.payload?.payment_link?.entity;
    const pay = body.payload?.payment?.entity;
    if (!link || !link.reference_id) return null;

    return {
      provider: KEY,
      paymentId: link.reference_id,
      status: PAYMENT_STATUS.PAID,
      paidAt: link.updated_at ? new Date(link.updated_at * 1000) : new Date(),
      // INR settlement (subunit). base_amount is the gross amount before fee
      // deduction — stored as-is. fees/tax are stored separately.
      baseAmountMinor: pay?.base_amount ?? pay?.amount ?? null,
      baseCurrency: pay?.base_currency || "INR",
      feeMinor: pay?.fee ?? null,        // in base_currency subunits (INR minor units)
      taxMinor: pay?.tax ?? null,        // in base_currency subunits
      feeType: pay?.fee_bearer ?? null,  // "platform" | "customer"
      providerRef: link.payments?.[0]?.payment_id || pay?.id || null,
      linkStatus: link.status, // 'paid'
      raw: body,
    };
  }

  if (event === "payment_link.expired") {
    const link = body.payload?.payment_link?.entity;
    if (!link || !link.reference_id) return null;
    return {
      provider: KEY,
      paymentId: link.reference_id,
      status: PAYMENT_STATUS.EXPIRED,
      linkStatus: link.status, // 'expired'
      raw: body,
    };
  }

  return null;
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
