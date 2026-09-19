/**
 * OpenAPI 3 documents generated from each brand's Express route table.
 *
 * There are no hand-written annotations, so there are no request/response
 * schemas — what you get is the complete, always-current list of method + path
 * per brand, path parameters, and the named middleware in front of each route.
 * That is the part that drifts when it is maintained by hand.
 */
const HTTP = ["get", "post", "put", "patch", "delete", "head", "options"];
const BODY_METHODS = new Set(["post", "put", "patch"]);

// Middleware that says nothing about the route (body parsers, cors, logging...).
const NOISE = new Set([
  "query", "expressInit", "jsonParser", "urlencodedParser", "textParser", "rawParser",
  "corsMiddleware", "cors", "helmetMiddleware", "logger", "morgan", "serveStatic",
  "cookieParser", "bound dispatch", "router", "mounted_app", "<anonymous>", "handle",
]);
const AUTH = /auth|staff|requireuser|requirerole|protect|jwt|guard|permission|authorize|admin/i;
const NOT_AUTH = /optional|readonly/i;

const isNoise = (n) => !n || n.length < 3 || NOISE.has(n);

function toOpenApiPath(p) {
  return p
    .replace(/\{[^}]*\}/g, "") // optional groups: keep the base path
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}")
    .replace(/\*([A-Za-z0-9_]+)/g, "{$1}");
}

const join = (...parts) => {
  const p = ("/" + parts.filter(Boolean).join("/")).replace(/\/+/g, "/");
  return p.length > 1 ? p.replace(/\/$/, "") : p;
};

function* pathsOf(raw) {
  if (typeof raw === "string") yield raw;
  else if (Array.isArray(raw)) for (const r of raw) yield* pathsOf(r);
  else if (raw instanceof RegExp) yield `/{regex:${raw.source.slice(0, 40)}}`;
}

/** Yields { method, path, middleware } for every route reachable from `stack`. */
function* walk(stack, prefix, inherited) {
  const local = [...inherited];
  for (const layer of stack) {
    if (layer.route) {
      const own = layer.route.stack.map((l) => l.name).filter((n) => !isNoise(n));
      const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
      const expanded = methods.includes("_all") ? HTTP.slice(0, 5) : methods;
      for (const rp of pathsOf(layer.route.path))
        for (const method of expanded)
          if (HTTP.includes(method)) yield { method, path: join(prefix, rp), middleware: [...local, ...own], all: methods.includes("_all") };
    } else if (layer.handle && layer.handle.stack) {
      // A nested router: its own router-level middleware only applies inside it.
      if (!("rawPath" in layer))
        throw new Error("Route paths were not recorded: require apps/api/lib/openapi/recordLayerPaths before express loads, or every mount prefix is lost");
      for (const sub of pathsOf(layer.rawPath === undefined ? "/" : layer.rawPath))
        yield* walk(layer.handle.stack, join(prefix, sub), local);
    } else if (!isNoise(layer.name)) {
      local.push(layer.name); // router.use(authenticate): protects what comes after it
    }
  }
}

const tagOf = (path) => {
  const seg = path.split("/").filter(Boolean).filter((s) => s !== "api" && !/^v\d+$/.test(s));
  const first = seg[0];
  return !first || first.startsWith("{") ? "root" : first;
};

const detectsAuth = (mw) => mw.some((n) => AUTH.test(n) && !NOT_AUTH.test(n));

function operationFor({ method, path, middleware, all }) {
  const params = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
    name: m[1], in: "path", required: true, schema: { type: "string" },
  }));
  const protectedRoute = detectsAuth(middleware);
  const mw = [...new Set(middleware)];
  const op = {
    tags: [tagOf(path)],
    summary: `${method.toUpperCase()} ${path}`,
    description:
      (protectedRoute ? "" : "**No auth middleware detected** on this route (heuristic: middleware names). It may authorise inside the handler, or be public.\n\n") +
      (mw.length ? `Middleware: ${mw.map((n) => "`" + n + "`").join(" → ")}` : "Middleware: none") +
      (all ? "\n\nRegistered with `.all()`; shown for every common method." : ""),
    parameters: params,
    responses: { 200: { description: "Success" }, default: { description: "Error" } },
    "x-auth-detected": protectedRoute,
  };
  if (protectedRoute) op.security = [{ bearerAuth: [] }];
  if (BODY_METHODS.has(method))
    op.requestBody = { required: false, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } };
  return op;
}

function collect(app) {
  const router = app.router || app._router;
  if (!router) throw new Error("app has no router (not an Express app?)");
  const seen = new Map();
  let duplicates = 0;
  for (const r of walk(router.stack, "", [])) {
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) { duplicates++; continue; } // first registration wins, like Express
    seen.set(key, r);
  }
  return { routes: [...seen.values()], duplicates };
}

const SECURITY = { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } };

function buildBrandSpec({ name, title, description, prefix, app }) {
  const { routes, duplicates } = collect(app);
  const paths = {};
  let withAuth = 0;
  for (const r of routes) {
    const op = operationFor(r);
    if (op["x-auth-detected"]) withAuth++;
    (paths[toOpenApiPath(r.path)] ||= {})[r.method] = op;
  }
  const tags = [...new Set(routes.map((r) => tagOf(r.path)))].sort().map((t) => ({ name: t }));
  return {
    openapi: "3.0.3",
    info: {
      title,
      version: "1.0.0",
      description:
        `${description}\n\nAll routes live under \`${prefix}\`. Generated from the Express route table: ` +
        `**${routes.length} operations**, ${withAuth} with auth middleware detected, ${routes.length - withAuth} without ` +
        `(heuristic — see each operation). No request/response schemas.` +
        (duplicates ? ` ${duplicates} duplicate registrations ignored.` : ""),
    },
    servers: [{ url: prefix }],
    tags,
    paths,
    components: { securitySchemes: SECURITY },
    "x-brand": name,
    "x-stats": { operations: routes.length, withAuth, withoutAuth: routes.length - withAuth },
  };
}

/** All brands in one document; paths carry the brand prefix, tags are "brand · segment". */
function buildCombinedSpec(brandSpecs) {
  const paths = {};
  const tags = new Set();
  for (const spec of brandSpecs) {
    const prefix = spec.servers[0].url;
    for (const [p, item] of Object.entries(spec.paths)) {
      const out = {};
      for (const [m, op] of Object.entries(item)) {
        const tag = `${spec["x-brand"]} · ${op.tags[0]}`;
        tags.add(tag);
        out[m] = { ...op, tags: [tag], summary: `${m.toUpperCase()} ${prefix}${p}` };
      }
      paths[prefix + p] = out;
    }
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "Product Space — all brands",
      version: "1.0.0",
      description: brandSpecs.map((s) => `**${s["x-brand"]}**: ${s["x-stats"].operations} operations`).join(" · "),
    },
    servers: [{ url: "/" }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: { securitySchemes: SECURITY },
  };
}

module.exports = { buildBrandSpec, buildCombinedSpec, collect };
