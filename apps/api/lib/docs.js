const crypto = require("crypto");
const swaggerUi = require("swagger-ui-express");
const { buildBrandSpec, buildCombinedSpec } = require("./openapi/buildSpec");

const META = {
  tps: { title: "The Product Space (TPS) API", description: "Learning platform, jobs, courses, events, leads, workflows." },
  gradient: { title: "The Gradient API", description: "Gradient learnings: courses, events, blog, leads, campaigns, workflows." },
  crm: { title: "Sales CRM API", description: "Leads, payments, invoices, cohorts, enrollments, meetings, onboarding." },
};

const safeEqual = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

function basicAuth(user, pass) {
  return (req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization || "").split(" ");
    if (scheme === "Basic" && encoded) {
      const [u, ...rest] = Buffer.from(encoded, "base64").toString().split(":");
      if (safeEqual(u, user) && safeEqual(rest.join(":"), pass)) return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="API docs"').status(401).send("Authentication required");
  };
}

/**
 * The docs are a complete map of every endpoint, so they are opt-in in production:
 *   - not production:  on (unless DOCS_ENABLED=false)
 *   - production:      only with DOCS_ENABLED=true AND DOCS_USER/DOCS_PASSWORD set;
 *                      otherwise off, with a warning. Never open by default there.
 */
function docsPolicy(env = process.env) {
  const prod = env.NODE_ENV === "production";
  const flag = env.DOCS_ENABLED;
  const hasCreds = !!(env.DOCS_USER && env.DOCS_PASSWORD);
  if (flag === "false") return { enabled: false };
  if (!prod) return { enabled: true, auth: hasCreds };
  if (flag === "true" && hasCreds) return { enabled: true, auth: true };
  return { enabled: false, warn: flag === "true" ? "DOCS_ENABLED=true in production needs DOCS_USER and DOCS_PASSWORD; docs stay off." : null };
}

function mountDocs(gateway, apps, brands, prefixes, env = process.env) {
  const policy = docsPolicy(env);
  if (!policy.enabled) {
    if (policy.warn) console.warn(`[docs] ${policy.warn}`);
    return null;
  }

  let cache;
  const specs = () => {
    if (cache) return cache;
    const perBrand = brands.map((name) =>
      buildBrandSpec({ name, prefix: prefixes[name], app: apps[name], ...META[name] }),
    );
    cache = { perBrand, combined: buildCombinedSpec(perBrand) };
    for (const s of perBrand) console.log(`[docs] ${s["x-brand"]}: ${s["x-stats"].operations} operations (${s["x-stats"].withoutAuth} without detected auth)`);
    return cache;
  };

  const guard = policy.auth ? [basicAuth(env.DOCS_USER, env.DOCS_PASSWORD)] : [];

  gateway.get("/docs/openapi/:name.json", ...guard, (req, res) => {
    const { perBrand, combined } = specs();
    const doc = req.params.name === "all" ? combined : perBrand.find((s) => s["x-brand"] === req.params.name);
    if (!doc) return res.status(404).json({ error: `Unknown brand "${req.params.name}"` });
    res.json(doc);
  });

  const urls = [
    ...brands.map((name) => ({ url: `/docs/openapi/${name}.json`, name: META[name].title })),
    { url: "/docs/openapi/all.json", name: "All brands (with prefixes)" },
  ];

  gateway.use(
    "/docs",
    ...guard,
    swaggerUi.serve,
    swaggerUi.setup(null, {
      explorer: true, // shows the top bar, which holds the brand (definition) selector
      customSiteTitle: "Product Space API",
      swaggerOptions: { urls, "urls.primaryName": urls[0].name, filter: true, docExpansion: "none", persistAuthorization: true, tryItOutEnabled: true },
    }),
  );

  console.log(`[docs] portal at /docs${policy.auth ? " (basic auth)" : ""}`);
  return policy;
}

module.exports = { mountDocs, docsPolicy };
