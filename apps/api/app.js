// Must run before anything loads express: remembers each router.use() path so the
// docs can rebuild full route paths (see lib/openapi/recordLayerPaths.js).
require("./lib/openapi/recordLayerPaths");
const express = require("express");
const { BRANDS, enabledBrands, assertBrandConfig, legacyHosts } = require("./lib/brands");
const { mountDocs } = require("./lib/docs");

/**
 * Builds the gateway. It parses no bodies and sets no CORS/helmet of its own:
 * every brand is a self-contained sub-app with its own middleware stack (CRM's
 * raw-body webhooks, TPS's open cors(), Gradient's activity logger...), and
 * mounting them as sub-apps is what keeps those stacks from leaking into each
 * other.
 *
 * Each brand is reachable two ways, both hitting the *same* sub-app instance:
 *   1. /<brand>/...            the new, canonical, non-overlapping URLs;
 *   2. its legacy hostname, at the root, exactly as before — so Cal.com,
 *      Razorpay, Cashfree, SES, Meta/Google OAuth callbacks, links inside
 *      already-sent emails, and the six frontends keep working unchanged.
 */
async function createGateway({ brands = enabledBrands() } = {}) {
  assertBrandConfig(brands);

  const gateway = express();
  gateway.set("trust proxy", 1); // req.hostname must honour X-Forwarded-Host

  const loaded = {};
  for (const name of brands) loaded[name] = await BRANDS[name].load();

  // 1. Legacy hostnames first, so "/leads" on crm-api.* is CRM's and never
  //    something else's. This includes /health: a load balancer checking
  //    crm-api.* must get CRM's own answer, not the gateway's.
  for (const name of brands) {
    const hosts = new Set(legacyHosts(name));
    if (!hosts.size) continue;
    const app = loaded[name];
    gateway.use((req, res, next) => (hosts.has(req.hostname.toLowerCase()) ? app(req, res, next) : next()));
  }

  // 2. Gateway health (any host that is not a brand's legacy host).
  gateway.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", brands, timestamp: new Date() });
  });

  // 3. API docs (a map of every endpoint, hence opt-in in production — see lib/docs.js).
  mountDocs(gateway, loaded, brands, Object.fromEntries(brands.map((b) => [b, BRANDS[b].prefix])));

  // 4. Prefixed mounts.
  for (const name of brands) gateway.use(BRANDS[name].prefix, loaded[name]);

  gateway.use((req, res) => {
    res.status(404).json({ error: "Not found", hint: `Routes live under ${brands.map((b) => BRANDS[b].prefix).join(", ")}` });
  });

  return { gateway, brands };
}

module.exports = { createGateway };
