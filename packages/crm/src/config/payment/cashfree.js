const psEnv = require("@ps/env/crm");
/**
 * Cashfree Payment Gateway client wrapper.
 *
 * All SDK calls are isolated here so the rest of the codebase stays
 * version-agnostic — if the `cashfree-pg` major version changes its API shape,
 * only this file needs adjusting.
 *
 * Targets the cashfree-pg v4 static API:
 *   Cashfree.XClientId / XClientSecret / XEnvironment
 *   Cashfree.PGCreateLink(apiVersion, request)
 *   Cashfree.PGCancelLink(apiVersion, linkId)
 *   Cashfree.PGFetchLink(apiVersion, linkId)
 *   Cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp)
 *
 * Required env: CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, CASHFREE_ENV
 * (SANDBOX | PRODUCTION). Webhook signature verification reuses the client
 * secret — no separate webhook secret is needed.
 */
const { Cashfree } = require("cashfree-pg");

// API version (YYYY-MM-DD) the SDK methods expect as their first argument.
const CASHFREE_API_VERSION = "2023-08-01";

Cashfree.XClientId = psEnv.CASHFREE_CLIENT_ID;
Cashfree.XClientSecret = psEnv.CASHFREE_CLIENT_SECRET;
Cashfree.XEnvironment =
  (psEnv.CASHFREE_ENV || "SANDBOX").toUpperCase() === "PRODUCTION"
    ? Cashfree.Environment.PRODUCTION
    : Cashfree.Environment.SANDBOX;

/**
 * Create a hosted payment link. Returns the Cashfree LinkEntity (the response
 * `data`), which includes link_url, link_status, cf_link_id, link_id.
 */
async function createLink(request) {
  const res = await Cashfree.PGCreateLink(CASHFREE_API_VERSION, request);
  return res.data;
}

/**
 * Cancel a payment link by its merchant link_id. Returns the LinkEntity.
 */
async function cancelLink(linkId) {
  const res = await Cashfree.PGCancelLink(CASHFREE_API_VERSION, linkId);
  return res.data;
}

/**
 * Read a link's current state by its merchant link_id. Returns the LinkEntity,
 * whose `link_status` is Cashfree's authority on whether the link is still
 * payable — needed because Cashfree does not push an event when a link lapses
 * into EXPIRED on its own.
 */
async function fetchLink(linkId) {
  const res = await Cashfree.PGFetchLink(CASHFREE_API_VERSION, linkId);
  return res.data;
}

/**
 * Verify an incoming webhook. The SDK throws if the signature is invalid;
 * we translate that into a boolean for the caller.
 *
 * @param {string} signature  x-webhook-signature header
 * @param {string} rawBody    raw request body (string)
 * @param {string} timestamp  x-webhook-timestamp header
 */
function verifyWebhook(signature, rawBody, timestamp) {
  // Diagnose common silent failures before touching the SDK.
  if (!signature) {
    console.error("[Cashfree webhook] Missing x-webhook-signature header");
    return false;
  }
  if (!timestamp) {
    console.error("[Cashfree webhook] Missing x-webhook-timestamp header");
    return false;
  }
  if (!Cashfree.XClientSecret) {
    console.error("[Cashfree webhook] CASHFREE_CLIENT_SECRET env var is not set");
    return false;
  }

  console.log("[Cashfree webhook] Verifying — timestamp:", timestamp, "| body length:", rawBody.length, "| secret set:", !!Cashfree.XClientSecret);

  try {
    Cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp);
    return true;
  } catch (err) {
    console.error("[Cashfree webhook] Signature mismatch:", err.message);
    return false;
  }
}

module.exports = {
  CASHFREE_API_VERSION,
  createLink,
  cancelLink,
  fetchLink,
  verifyWebhook,
};
