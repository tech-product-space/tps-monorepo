/**
 * Payment provider registry.
 *
 * Every gateway implements the same interface:
 *   key, label
 *   supportedCurrencies()            → string[]
 *   supportsCurrency(currency)       → boolean
 *   createLink({ payment, leadProfile, amount, currency, description, expiry })
 *       → { providerLinkId, shortUrl, status, expireBy, raw }
 *   cancelLink(providerLinkId)       → void (throws GatewayError)
 *   fetchLink(providerLinkId)        → { status, raw }
 *   verifyWebhook(req, rawBody)      → boolean
 *   parseWebhook(body)               → normalized payment event | null
 *
 * Adding a gateway = drop a `*.provider.js` file in this folder, register it
 * here, and add a webhook route. The payment service / webhook handler never
 * change.
 */
const razorpay = require("./razorpay.provider");
const cashfree = require("./cashfree.provider");

const PROVIDERS = Object.freeze({
  [razorpay.key]: razorpay,
  [cashfree.key]: cashfree,
});

function getProvider(key) {
  return PROVIDERS[String(key || "").toLowerCase()] || null;
}

function listProviders() {
  return Object.values(PROVIDERS);
}

/** Gateways that can accept the given currency. */
function providersForCurrency(currency) {
  return listProviders().filter((p) => p.supportsCurrency(currency));
}

/**
 * The union of every enabled provider's supported currencies — drives the
 * enrollment currency dropdown. Sorted, with INR first.
 */
function enrollmentCurrencies() {
  const set = new Set();
  for (const p of listProviders()) {
    for (const c of p.supportedCurrencies()) set.add(c);
  }
  const codes = Array.from(set);
  codes.sort((a, b) => {
    if (a === "INR") return -1;
    if (b === "INR") return 1;
    return a.localeCompare(b);
  });
  return codes;
}

module.exports = {
  PROVIDERS,
  getProvider,
  listProviders,
  providersForCurrency,
  enrollmentCurrencies,
};
