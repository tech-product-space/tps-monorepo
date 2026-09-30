import {
  ACTIVITY_ACTOR_TYPE,
  ACTIVITY_STATUS,
  ACTIVITY_VERB,
} from "../config/constants/activityLog.js";
import { redact, summariseValue } from "../util/helpers/activityDiff.js";
import {
  buildAction,
  resolveActivity,
} from "../services/activityLog/registry.js";
import {
  recordActivitySafe,
  resolveActorDetails,
  resolveEntityLabel,
} from "../services/activityLog/recordActivity.service.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Response fields worth keeping. Deliberately a shortlist: retaining whole
 * response bodies is how a JSONB column quietly becomes the biggest table in
 * the database.
 */
const RETAINED_RESPONSE_FIELDS = [
  "id",
  "isPublished",
  "isActive",
  "status",
  "affectedCount",
  "updatedCount",
];

const pickResponseFields = (body) => {
  const out = {};

  if (!body || typeof body !== "object") return out;

  const data = body.data && typeof body.data === "object" ? body.data : body;

  for (const field of RETAINED_RESPONSE_FIELDS) {
    if (data[field] !== undefined && typeof data[field] !== "object") {
      out[field] = data[field];
    }
  }

  // Login responds { token, admin } rather than { data }, and the actor has to
  // come from somewhere — `login` runs before any auth middleware.
  if (body.admin && typeof body.admin === "object") {
    out.actor = {
      id: body.admin.id,
      name: body.admin.name,
      email: body.admin.email,
      role: body.admin.role?.name || body.admin.role || null,
    };
    if (out.id === undefined) out.id = body.admin.id;
  }

  return out;
};

const readPath = (source, path) => {
  if (!path) return null;

  return path
    .split(".")
    .reduce((acc, key) => (acc == null ? acc : acc[key]), source);
};

const getClientIp = (req) =>
  (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
  req.socket?.remoteAddress ||
  null;

/**
 * Logs every mutating admin request. Mounted once, globally, before the routers
 * in `app.js` — that single mount is what gives coverage of all admin routes
 * without touching a controller.
 *
 * A controller can enrich its row via `req.activity.set({ ... })` or drop it
 * with `req.activity.skip()`. Both are optional; see `updateCourse` for the
 * snapshot → update → diff pattern.
 */
export const activityLogger = (req, res, next) => {
  // Reads are the overwhelming majority of traffic and are out of scope, so
  // they cost nothing here — no listener, no body copy.
  if (!MUTATING_METHODS.has(req.method)) return next();

  const isMultipart = (req.headers["content-type"] || "").includes(
    "multipart/",
  );

  // Copied now because controllers mutate req.body (normalising slugs, deleting
  // password fields) before the response is sent.
  let requestBody = null;

  if (!isMultipart && req.body && typeof req.body === "object") {
    try {
      requestBody = redact({ ...req.body });
    } catch {
      requestBody = null;
    }
  }

  const pending = {
    entityId: undefined,
    entityLabel: undefined,
    summary: undefined,
    verb: undefined,
    changes: undefined,
    metadata: undefined,
    entityType: undefined,
    skipped: false,
  };

  req.activity = {
    set(patch = {}) {
      Object.assign(pending, patch);
      return req.activity;
    },
    skip() {
      pending.skipped = true;
      return req.activity;
    },
  };

  let responseFields = {};
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    try {
      responseFields = pickResponseFields(body);
    } catch {
      responseFields = {};
    }
    return originalJson(body);
  };

  res.on("finish", () => {
    try {
      if (pending.skipped) return;

      const routeKey = `${req.method} ${req.baseUrl || ""}${
        req.route?.path || ""
      }`;

      const { descriptor, matched } = resolveActivity(
        routeKey,
        req.method,
        req.originalUrl.split("?")[0],
      );

      if (!descriptor || descriptor.skip) return;

      const failed = res.statusCode >= 400;

      if (failed && !descriptor.logFailures) return;

      const admin = req.admin;
      const responseActor = descriptor.actorFromResponse
        ? responseFields.actor
        : null;

      // No actor and no way to derive one means an unauthenticated write. A row
      // attributed to nobody is worse than no row — it looks authoritative and
      // answers nothing. The routes that can still land here are covered in
      // ACTIVITY_LOG_PLAN.md §7.
      if (!admin?.id && !responseActor?.id && !descriptor.logFailures) return;

      const ctx = { req, response: responseFields, body: requestBody };

      const verb =
        pending.verb ||
        (typeof descriptor.verbFrom === "function"
          ? descriptor.verbFrom(ctx)
          : null) ||
        (failed && descriptor.verb === ACTIVITY_VERB.LOGIN
          ? ACTIVITY_VERB.LOGIN_FAILED
          : descriptor.verb);

      const entityType = pending.entityType || descriptor.entityType;

      const entityId =
        pending.entityId !== undefined
          ? pending.entityId
          : descriptor.entityIdFrom === null
            ? null
            : descriptor.entityIdFrom?.startsWith("response.")
              ? readPath({ response: responseFields }, descriptor.entityIdFrom)
              : readPath(
                  { params: req.params },
                  descriptor.entityIdFrom || "params.id",
                ) || null;

      const entityLabel =
        pending.entityLabel !== undefined
          ? pending.entityLabel
          : descriptor.labelFrom
            ? summariseValue(readPath({ body: requestBody }, descriptor.labelFrom))
            : null;

      // With no diff from the controller, the redacted request body is the next
      // best record of intent — summarised, so a blog body cannot land in it.
      const changes =
        pending.changes ??
        (requestBody
          ? Object.fromEntries(
              Object.entries(requestBody).map(([key, value]) => [
                key,
                { from: null, to: summariseValue(value) },
              ]),
            )
          : {});

      const metadata = { ...(pending.metadata || {}) };

      if (!matched) metadata.unmappedRoute = true;
      if (isMultipart) metadata.multipart = true;
      if (failed) metadata.failed = true;
      if (descriptor.actorFromResponse && !responseActor?.id && requestBody) {
        metadata.attemptedEmail = requestBody.email || null;
      }
      if (req.params && Object.keys(req.params).length > 0) {
        metadata.params = req.params;
      }

      const payload = {
        actorType: ACTIVITY_ACTOR_TYPE.ADMIN,
        actorId: admin?.id || responseActor?.id || null,
        actorName: admin?.name || responseActor?.name || null,
        actorEmail: admin?.email || responseActor?.email || null,
        actorRole: admin?.role || responseActor?.role || null,
        action: buildAction(entityType, verb),
        entityType,
        entityId,
        entityLabel,
        summary: pending.summary ?? descriptor.summary ?? null,
        changes,
        metadata,
        method: req.method,
        path: req.originalUrl.split("?")[0],
        routeKey,
        statusCode: res.statusCode,
        status: failed ? ACTIVITY_STATUS.FAILURE : ACTIVITY_STATUS.SUCCESS,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      };

      // Two optional lookups, both after the response has been sent so nothing
      // waits on them:
      //
      //  - actor name/email, for tokens issued before those were added
      //  - entity label, when neither the controller nor the request body had one
      //
      // Skipped for deletes: the row is already gone, so only a controller that
      // captured the label before `destroy()` can supply it.
      const needsActor =
        payload.actorId && (!payload.actorName || !payload.actorEmail);
      const needsLabel =
        !payload.entityLabel &&
        payload.entityId &&
        verb !== ACTIVITY_VERB.DELETED;

      if (!needsActor && !needsLabel) {
        recordActivitySafe(payload);
        return;
      }

      Promise.all([
        needsActor ? resolveActorDetails(payload.actorId) : null,
        needsLabel ? resolveEntityLabel(entityType, payload.entityId) : null,
      ])
        .then(([actor, label]) => {
          if (actor) {
            payload.actorName = payload.actorName || actor.name;
            payload.actorEmail = payload.actorEmail || actor.email;
            payload.actorRole = payload.actorRole || actor.role;
          }

          if (label) payload.entityLabel = label;
        })
        .catch(() => {
          // Enrichment is a nicety; the row is still worth writing without it.
        })
        .finally(() => recordActivitySafe(payload));
    } catch (err) {
      console.error("[activityLog] middleware error:", err?.message);
    }
  });

  return next();
};

export default activityLogger;
