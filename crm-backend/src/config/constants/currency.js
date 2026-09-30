/**
 * ISO currency reference — exponent (minor-unit decimals) + display symbol.
 *
 * This is shared money math, NOT a supported-currency list: a currency's
 * decimal behaviour is the same for every gateway. Which currencies a gateway
 * actually accepts is provider-specific and declared in each provider module
 * (e.g. config/payment/providers/razorpay.provider.js).
 *
 * `exponent` is the number of decimal places in the currency's minor unit
 * (the "subunit"). Gateways want amounts in the smallest unit, so the
 * multiplier is 10^exponent:
 *   - exponent 0 (JPY, KRW, VND…): amount is already the smallest unit  → ×1
 *   - exponent 2 (INR, USD, EUR…): amount × 100  → paise / cents
 *   - exponent 3 (KWD, BHD, OMR…): amount × 1000
 *
 * `getExponent` defaults to 2 for any code not listed so an unexpected
 * currency degrades to the most common behaviour rather than throwing.
 */

// ISO 4217 code → minor-unit exponent.
const CURRENCY_EXPONENT = Object.freeze({
  AED: 2, ALL: 2, AMD: 2, ARS: 2, AUD: 2, AWG: 2, AZN: 2,
  BAM: 2, BBD: 2, BDT: 2, BGN: 2, BHD: 3, BIF: 0, BMD: 2, BND: 2, BOB: 2,
  BRL: 2, BSD: 2, BTN: 2, BWP: 2, BZD: 2,
  CAD: 2, CHF: 2, CLP: 0, CNY: 2, COP: 2, CRC: 2, CUP: 2, CVE: 2, CZK: 2,
  DJF: 0, DKK: 2, DOP: 2, DZD: 2,
  EGP: 2, ETB: 2, EUR: 2,
  FJD: 2,
  GBP: 2, GHS: 2, GIP: 2, GMD: 2, GNF: 0, GTQ: 2, GYD: 2,
  HKD: 2, HNL: 2, HRK: 2, HTG: 2, HUF: 2,
  IDR: 2, ILS: 2, INR: 2, IQD: 3, ISK: 0,
  JMD: 2, JOD: 3, JPY: 0,
  KES: 2, KGS: 2, KHR: 2, KMF: 0, KRW: 0, KWD: 3, KYD: 2, KZT: 2,
  LAK: 2, LKR: 2, LRD: 2, LSL: 2,
  MAD: 2, MDL: 2, MGA: 2, MKD: 2, MMK: 2, MNT: 2, MOP: 2, MUR: 2, MVR: 2,
  MWK: 2, MXN: 2, MYR: 2,
  NAD: 2, NGN: 2, NIO: 2, NOK: 2, NPR: 2, NZD: 2,
  OMR: 3,
  PEN: 2, PGK: 2, PHP: 2, PKR: 2, PLN: 2, PYG: 0,
  QAR: 2,
  RON: 2, RSD: 2, RUB: 2, RWF: 0,
  SAR: 2, SCR: 2, SEK: 2, SGD: 2, SLL: 2, SOS: 2, SSP: 2, SVC: 2, SZL: 2,
  THB: 2, TND: 3, TRY: 2, TTD: 2, TWD: 2, TZS: 2,
  UAH: 2, UGX: 0, USD: 2, UYU: 2, UZS: 2,
  VND: 0, VUV: 0,
  XAF: 0, XCD: 2, XOF: 0, XPF: 0,
  YER: 2,
  ZAR: 2, ZMW: 2,
});

// Display symbols for the currencies we actually transact in. Anything not
// listed falls back to its ISO code, which is always meaningful.
const CURRENCY_SYMBOL = Object.freeze({
  INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥",
  AUD: "A$", CAD: "C$", AED: "AED", SGD: "S$",
});

const DEFAULT_EXPONENT = 2;

function getExponent(currency) {
  const code = String(currency || "").toUpperCase();
  return Object.prototype.hasOwnProperty.call(CURRENCY_EXPONENT, code)
    ? CURRENCY_EXPONENT[code]
    : DEFAULT_EXPONENT;
}

function isKnownCurrency(currency) {
  const code = String(currency || "").toUpperCase();
  return Object.prototype.hasOwnProperty.call(CURRENCY_EXPONENT, code);
}

/**
 * Convert a major-unit amount (e.g. 799 USD) to the gateway's smallest unit
 * (79900 cents). Rounds to an integer — gateways reject fractional subunits.
 */
function toSubunit(amount, currency) {
  const factor = 10 ** getExponent(currency);
  return Math.round(Number(amount) * factor);
}

/**
 * Convert a smallest-unit amount (79900 cents) back to major units (799 USD).
 * Used for gateway-reported fee / tax / base_amount fields.
 */
function fromSubunit(minor, currency) {
  const factor = 10 ** getExponent(currency);
  return Number(minor) / factor;
}

function getSymbol(currency) {
  const code = String(currency || "").toUpperCase();
  return CURRENCY_SYMBOL[code] || code;
}

/**
 * Compact server-side money string for activity logs / messages, e.g. "₹799"
 * or "$799". Frontend formatting uses Intl.NumberFormat instead.
 */
function formatMoney(amount, currency) {
  return `${getSymbol(currency)}${Number(amount)}`;
}

module.exports = {
  CURRENCY_EXPONENT,
  CURRENCY_SYMBOL,
  getExponent,
  isKnownCurrency,
  toSubunit,
  fromSubunit,
  getSymbol,
  formatMoney,
};
