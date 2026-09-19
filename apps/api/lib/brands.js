/**
 * The three brands and how to load / start / validate each.
 *
 * BRANDS=tps,gradient,crm (default: all three) picks which ones boot in this
 * process, so the same build can later be split across instances if one brand
 * needs isolating.
 */
const { brandEnv } = require("@ps/env");

const BRANDS = {
  tps: {
    prefix: "/tps",
    env: brandEnv("TPS"),
    legacyHostsVar: "TPS_LEGACY_HOSTS",
    async load() {
      return require("@ps/tps/app.js");
    },
    async connect() {
      const { sequelize } = require("@ps/tps/models");
      await sequelize.authenticate();
      // Mongo is small (OTPs + interview Q&A + Agenda's collection) but the API
      // routes for those need it, exactly as tps-next-backend/server.js did.
      // Only when configured: connectMongoDB() process.exit(1)s on failure, which
      // is right for prod but makes local dev impossible without a Mongo.
      if (BRANDS.tps.env.MONGO_DB_URL) await require("@ps/tps/config/mongoDb")();
      else console.warn("[api] tps: MONGO_DB_URL not set — OTP and interview routes will not work");
    },
  },
  gradient: {
    prefix: "/gradient",
    env: brandEnv("GRADIENT"),
    legacyHostsVar: "GRADIENT_LEGACY_HOSTS",
    async load() {
      return (await import("@ps/gradient/src/app.js")).default;
    },
    async connect() {
      // Agenda (and every other background job) is started by apps/worker.
      const { initServices } = await import("@ps/gradient/src/boot.js");
      await initServices({ agenda: false });
    },
  },
  crm: {
    prefix: "/crm",
    env: brandEnv("CRM"),
    legacyHostsVar: "CRM_LEGACY_HOSTS",
    async load() {
      return require("@ps/crm/src/app.js");
    },
    async connect() {
      const { sequelize } = require("@ps/crm/src/models");
      await sequelize.authenticate();
    },
  },
};

function enabledBrands(raw = process.env.BRANDS) {
  const names = (raw || Object.keys(BRANDS).join(","))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const n of names) {
    if (!BRANDS[n]) throw new Error(`BRANDS contains unknown brand "${n}" (known: ${Object.keys(BRANDS).join(", ")})`);
  }
  return [...new Set(names)];
}

/**
 * Refuse to boot a configuration that would silently mix brands:
 *  - every enabled brand needs its own PG_SCHEMA (otherwise all three write to
 *    the same tables — the 25 colliding table names would corrupt each other);
 *  - no two brands may resolve the same JWT_SECRET (a token minted by one brand
 *    would then pass the other's auth middleware).
 * Only checked when more than one brand shares this process.
 */
function assertBrandConfig(names) {
  if (names.length < 2) return;
  const problems = [];

  const schemas = new Map();
  for (const n of names) {
    const schema = BRANDS[n].env.PG_SCHEMA;
    if (!schema) problems.push(`${n.toUpperCase()}_PG_SCHEMA is not set`);
    else if (schemas.has(schema)) problems.push(`${n} and ${schemas.get(schema)} both use PG_SCHEMA="${schema}"`);
    else schemas.set(schema, n);
  }

  const secrets = new Map();
  for (const n of names) {
    const secret = BRANDS[n].env.JWT_SECRET;
    if (!secret) problems.push(`${n.toUpperCase()}_JWT_SECRET is not set`);
    else if (secrets.has(secret)) problems.push(`${n} and ${secrets.get(secret)} share the same JWT_SECRET`);
    else secrets.set(secret, n);
  }

  if (problems.length) {
    throw new Error(`Invalid multi-brand configuration:\n  - ${problems.join("\n  - ")}`);
  }
}

function legacyHosts(name) {
  return (process.env[BRANDS[name].legacyHostsVar] || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = { BRANDS, enabledBrands, assertBrandConfig, legacyHosts };
