/**
 * OpenAPI 3 documents generated from each brand's Express route table.
 *
 * There are no hand-written annotations: what you get is the complete,
 * always-current list of method + path per brand, path parameters, the named
 * middleware in front of each route, and request-body fields inferred from
 * validators and handler code (see requestBodyFor). No response schemas.
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

/**
 * Yields { method, path, middleware, handlers, guards } for every route reachable from `stack`.
 * `middleware` are names (for display); `guards` are the functions themselves — router-level
 * ones included — so an unnamed auth check can still be recognised by its code.
 */
function* walk(stack, prefix, inherited, inheritedFns = []) {
  const local = [...inherited];
  const localFns = [...inheritedFns];
  for (const layer of stack) {
    if (layer.route) {
      const own = layer.route.stack.map((l) => l.name).filter((n) => !isNoise(n));
      const handlers = layer.route.stack.map((l) => l.handle);
      const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
      const expanded = methods.includes("_all") ? HTTP.slice(0, 5) : methods;
      for (const rp of pathsOf(layer.route.path))
        for (const method of expanded)
          if (HTTP.includes(method))
            yield { method, path: join(prefix, rp), middleware: [...local, ...own], handlers, guards: [...localFns, ...handlers], all: methods.includes("_all") };
    } else if (layer.handle && layer.handle.stack) {
      // A nested router: its own router-level middleware only applies inside it.
      if (!("rawPath" in layer))
        throw new Error("Route paths were not recorded: require apps/api/lib/openapi/recordLayerPaths before express loads, or every mount prefix is lost");
      for (const sub of pathsOf(layer.rawPath === undefined ? "/" : layer.rawPath))
        yield* walk(layer.handle.stack, join(prefix, sub), local, localFns);
    } else {
      // router.use(authenticate): protects what comes after it
      if (!isNoise(layer.name)) local.push(layer.name);
      if (typeof layer.handle === "function") localFns.push(layer.handle);
    }
  }
}

const tagOf = (path) => {
  const seg = path.split("/").filter(Boolean).filter((s) => s !== "api" && !/^v\d+$/.test(s));
  const first = seg[0];
  return !first || first.startsWith("{") ? "root" : first;
};

const detectsAuth = (mw) => mw.some((n) => AUTH.test(n) && !NOT_AUTH.test(n));

// Unnamed middleware (`module.exports = async (req, res, next) => ...`) has no name to
// match, so also look at what the code does: reads the bearer token or verifies a JWT
// AND answers 401. Optional-auth middleware reads the token too but never rejects.
const AUTH_SRC = /jwt\.verify\(|req\.headers\.authorization|req\.headers\[["']authorization["']\]|req\.(get|header)\(["']authorization["']\)/i;
const REJECTS = /\b401\b|Unauthori[sz]ed/;
const guardCache = new WeakMap();
function checksAuth(fn) {
  if (typeof fn !== "function") return false;
  if (!guardCache.has(fn)) {
    const src = sourceOf(fn);
    guardCache.set(fn, AUTH_SRC.test(src) && REJECTS.test(src));
  }
  return guardCache.get(fn);
}

// ---- Request bodies ---------------------------------------------------------
// Nothing declares body shapes, so they are inferred from the route's own
// functions: express-validator chains (CRM) give fields, required-ness and
// types; everything else is read off the handler's source — `{ a, b } = req.body`
// destructuring and `req.body.x` access. asyncWrapper exposes the wrapped
// handler as `.inner`. Fields read only inside called services are missed.

const IDENT = /^[A-Za-z_$][\w$]*$/;
const VALIDATOR_TYPES = {
  isInt: "integer", isNumeric: "number", isFloat: "number", isDecimal: "number",
  isBoolean: "boolean", isArray: "array", isObject: "object",
};

// Split "a, b = {x, y}, c: d" on top-level commas only.
function splitTopLevel(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if ("{[(".includes(ch)) depth++;
    else if ("}])".includes(ch)) depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const sourceOf = (fn) => {
  try { return Function.prototype.toString.call(fn.inner || fn); } catch { return ""; }
};

function fieldsFromSource(src, add) {
  // One nesting level inside the braces covers defaults like `{ tags = [], meta = {} }`.
  for (const m of src.matchAll(/(?:const|let|var)\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*=\s*req\.body\b/g))
    for (const part of splitTopLevel(m[1])) {
      const key = part.trim().split(/[:=]/)[0].trim().replace(/^["']|["']$/g, "");
      if (key && !key.startsWith("...") && IDENT.test(key)) add(key);
    }
  for (const m of src.matchAll(/req\.body\??\.([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/req\.body\[\s*["'`]([^"'`]+)["'`]\s*\]/g)) add(m[1]);
}

function fieldsFromValidator(fn, add) {
  let ctx;
  try { ctx = fn && fn.builder && typeof fn.builder.build === "function" ? fn.builder.build() : null; } catch { return false; }
  if (!ctx || !Array.isArray(ctx.fields) || !(ctx.locations || []).includes("body")) return false;
  const names = (ctx.stack || []).map((s) => s && s.validator && s.validator.name).filter(Boolean);
  const type = names.map((n) => VALIDATOR_TYPES[n]).find(Boolean) || "string";
  const format = names.includes("isEmail") ? "email" : undefined;
  for (const f of ctx.fields) {
    const key = String(f).split(".")[0];
    if (key && key !== "*") add(key, { type, format, required: !ctx.optional });
  }
  return true;
}

const EXAMPLES = { integer: 0, number: 0, boolean: false, array: [], object: {} };

function requestBodyFor(handlers = []) {
  const fields = new Map();
  const add = (name, info = {}) => fields.set(name, { ...(fields.get(name) || {}), ...info });
  let validated = false;
  for (const fn of handlers) {
    if (typeof fn !== "function") continue;
    if (fieldsFromValidator(fn, add)) validated = true;
    else fieldsFromSource(sourceOf(fn), add);
  }
  if (!fields.size) {
    return {
      note: "Body fields could not be inferred (the handler passes `req.body` on whole, or reads it in a service).",
      body: { required: false, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
    };
  }
  const properties = {}, example = {}, required = [];
  for (const [name, { type, format, required: req }] of fields) {
    properties[name] = type ? { type, ...(format && { format }) } : {};
    example[name] = type ? (EXAMPLES[type] ?? (format === "email" ? "user@example.com" : "string")) : "string";
    if (req) required.push(name);
  }
  return {
    note: `Body fields inferred from ${validated ? "express-validator rules and " : ""}the handler's code` +
      (validated ? "." : " — types and required fields are not declared, so every field shows as a string."),
    body: {
      required: required.length > 0,
      content: { "application/json": {
        schema: { type: "object", properties, ...(required.length && { required }), additionalProperties: true },
        example,
      } },
    },
  };
}

function operationFor({ method, path, middleware, handlers, guards = [], all }) {
  const params = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
    name: m[1], in: "path", required: true, schema: { type: "string" },
  }));
  const byName = detectsAuth(middleware);
  const byCode = !byName && guards.some(checksAuth);
  const protectedRoute = byName || byCode;
  const mw = [...new Set(middleware)];
  if (byCode) mw.unshift("(unnamed auth check)");
  const op = {
    tags: [tagOf(path)],
    summary: `${method.toUpperCase()} ${path}`,
    description:
      (protectedRoute ? "" : "**No auth check detected** on this route (heuristic: middleware names and code). It may authorise inside a service, or be public.\n\n") +
      (byCode ? "Auth detected from the middleware's code (it checks a token and answers 401).\n\n" : "") +
      (mw.length ? `Middleware: ${mw.map((n) => "`" + n + "`").join(" → ")}` : "Middleware: none") +
      (all ? "\n\nRegistered with `.all()`; shown for every common method." : ""),
    parameters: params,
    responses: { 200: { description: "Success" }, default: { description: "Error" } },
    "x-auth-detected": protectedRoute,
  };
  if (protectedRoute) op.security = [{ bearerAuth: [] }];
  if (BODY_METHODS.has(method)) {
    const { body, note } = requestBodyFor(handlers);
    op.requestBody = body;
    op.description += `\n\n${note}`;
    op["x-body-inferred"] = "properties" in body.content["application/json"].schema;
  }
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
// Document-wide *optional* bearer: Swagger UI then sends the Authorize token on every
// operation, so routes whose auth check was not detected can still be tried.
const OPTIONAL_BEARER = [{ bearerAuth: [] }, {}];

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
        `(heuristic — see each operation). Request bodies are inferred from validators and handler code; no response schemas.` +
        (duplicates ? ` ${duplicates} duplicate registrations ignored.` : ""),
    },
    servers: [{ url: prefix }],
    tags,
    paths,
    components: { securitySchemes: SECURITY },
    security: OPTIONAL_BEARER,
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
    security: OPTIONAL_BEARER,
  };
}

module.exports = { buildBrandSpec, buildCombinedSpec, collect };
