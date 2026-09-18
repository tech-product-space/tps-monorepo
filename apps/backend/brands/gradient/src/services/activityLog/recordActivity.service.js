import db from "../../database/postgres/models/index.js";
import {
  ACTIVITY_ACTOR_TYPE,
  ACTIVITY_LIMITS,
  ACTIVITY_STATUS,
} from "../../config/constants/activityLog.js";
import {
  capBytes,
  redact,
  summariseChanges,
  summariseMetadata,
} from "../../util/helpers/activityDiff.js";
import { LABEL_FIELDS } from "./registry.js";

const { ActivityLog, AdminUser, AdminRole } = db;

/**
 * Tokens issued before this feature shipped carry only { id, roleId, role } and
 * are valid for 30 days, so the actor's name and email have to be looked up for
 * about a month. Cached to keep that to one query per admin per 5 minutes —
 * and it runs after the response has been sent either way.
 */
const ACTOR_CACHE_TTL_MS = 5 * 60 * 1000;
const actorCache = new Map();

export const resolveActorDetails = async (adminId) => {
  if (!adminId) return null;

  const cached = actorCache.get(adminId);

  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const admin = await AdminUser.findByPk(adminId, {
      attributes: ["id", "name", "email"],
      include: [{ model: AdminRole, as: "role", attributes: ["name"] }],
    });

    const value = admin
      ? {
          name: admin.name,
          email: admin.email,
          role: admin.role?.name || null,
        }
      : null;

    actorCache.set(adminId, {
      value,
      expiresAt: Date.now() + ACTOR_CACHE_TTL_MS,
    });

    return value;
  } catch {
    return null;
  }
};

/** Called when an admin is renamed or deleted, so the cache cannot go stale. */
export const invalidateActorCache = (adminId) => {
  if (adminId) actorCache.delete(adminId);
  else actorCache.clear();
};

/**
 * Looks up an entity's display name from `LABEL_FIELDS`.
 *
 * Lets the log name what was touched without every controller opting in. Runs
 * after the response, and returns null on anything unexpected — a missing label
 * degrades the sentence to "updated a blog post", which is worth far less than
 * a request, so this must never be able to disrupt one.
 */
export const resolveEntityLabel = async (entityType, entityId) => {
  if (!entityId) return null;

  const mapping = LABEL_FIELDS[entityType];

  if (!mapping) return null;

  const model = db[mapping.model];

  if (!model) return null;

  try {
    const record = await model.findByPk(entityId, {
      attributes: [mapping.field],
      raw: true,
    });

    return record?.[mapping.field] ?? null;
  } catch {
    return null;
  }
};

const truncate = (value, max) =>
  typeof value === "string" && value.length > max
    ? value.slice(0, max)
    : value ?? null;

/**
 * The single writer. Every payload passes through redaction and the byte caps
 * here rather than at the call site, so a hand-built payload cannot smuggle a
 * password or a 40 KB HTML body into the table.
 */
export const recordActivity = async ({
  actorType = ACTIVITY_ACTOR_TYPE.ADMIN,
  actorId = null,
  actorName = null,
  actorEmail = null,
  actorRole = null,
  action,
  entityType,
  entityId = null,
  entityLabel = null,
  summary = null,
  changes = {},
  metadata = {},
  method = null,
  path = null,
  routeKey = null,
  statusCode = null,
  status,
  ipAddress = null,
  userAgent = null,
}) => {
  if (!action || !entityType) {
    throw new Error("recordActivity requires `action` and `entityType`");
  }

  return ActivityLog.create({
    actorType,
    actorId,
    actorName: truncate(actorName, 255),
    actorEmail: truncate(actorEmail, 255),
    actorRole: truncate(actorRole, 255),
    action,
    entityType,
    entityId,
    entityLabel: truncate(entityLabel, 255),
    summary: truncate(summary, ACTIVITY_LIMITS.MAX_SUMMARY),
    // redact → summarise → cap, in that order. Redaction first so a secret can
    // never reach the other two; the cap last, as a backstop for a diff that is
    // wide rather than deep (many changed fields, each individually short).
    changes: capBytes(
      summariseChanges(redact(changes)),
      ACTIVITY_LIMITS.MAX_CHANGES_BYTES,
    ),
    metadata: capBytes(
      summariseMetadata(redact(metadata)),
      ACTIVITY_LIMITS.MAX_METADATA_BYTES,
    ),
    method,
    path: truncate(path, 255),
    routeKey: truncate(routeKey, 255),
    statusCode,
    status:
      status ||
      (statusCode && statusCode >= 400
        ? ACTIVITY_STATUS.FAILURE
        : ACTIVITY_STATUS.SUCCESS),
    ipAddress: truncate(ipAddress, 64),
    userAgent: truncate(userAgent, ACTIVITY_LIMITS.MAX_USER_AGENT),
  });
};

/**
 * Fire-and-forget. Never awaited by a request, never throws.
 *
 * An audit log must not be able to take the panel down: if the table is missing,
 * the column types drift, or Postgres is briefly unavailable, the worst outcome
 * allowed here is a line on stderr.
 */
export const recordActivitySafe = (payload) => {
  Promise.resolve()
    .then(() => recordActivity(payload))
    .catch((err) => {
      console.error(
        "[activityLog] failed to record:",
        payload?.routeKey || payload?.action,
        err?.message,
      );
    });
};
