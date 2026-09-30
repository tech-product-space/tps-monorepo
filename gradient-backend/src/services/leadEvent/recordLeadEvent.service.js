import { LEAD_EVENT_TYPE } from "../../config/constants/leadEvent.js";
import logger from "../../util/logger.js";

/**
 * Models are resolved lazily, not imported at the top of the file.
 *
 * Model files call the emitters that call this service, and `models/index.js`
 * imports every model file — so a static import here would close the loop
 * `leadEvent.model.js -> emitters -> this -> models/index.js -> leadEvent.model.js`
 * and `db` would be undefined at module-evaluation time, crashing at boot.
 * A dynamic import inside the call resolves after the loader has finished, and
 * ESM caches the module so it is a map lookup from the second call on.
 */
const getModels = async () =>
  (await import("../../database/postgres/models/index.js")).default;

/**
 * Nudges anyone parked on a branch waiting for exactly this event.
 *
 * Fire-and-forget and lazily imported — the waker pulls in the queue, and
 * recording an activity event must not wait on Redis, or fail because of it.
 * Missing a wake costs a *timely* branch, never a correct one: the branch
 * handler always has an advance scheduled at its own deadline.
 */
const wake = (email, eventType) => {
  import("../workflow/wakeWaiters.js")
    .then(({ wakeWaiters }) => wakeWaiters(email, eventType))
    .catch(() => {});
};

/**
 * The only writer of `lead_events`.
 *
 * Two rules it exists to enforce, both of which are easy to get wrong at a call
 * site and impossible to fix afterwards:
 *
 * 1. **Recording must never affect the request.** Every emitter is on the path
 *    of a public form submission or registration. A failure here is logged and
 *    swallowed — the same discipline `activityLogger` follows, and for a
 *    stronger reason: a visitor seeing a 500 because we could not write a
 *    timeline row would be an absurd trade.
 * 2. **One normalisation.** Email is lowercased and trimmed here, once, so a
 *    condition querying `lead_events` and an audience built by
 *    `buildRecipients` are looking at the same string.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §4.5.
 */

/** The identity, per §8.1. Not a `.toLowerCase()` at eleven call sites. */
export const normaliseEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

/**
 * Writes one event.
 *
 * Resolves rather than throws, always. Returns the row on success, `null` when
 * nothing was written — no email, an unknown type, a duplicate, or a failure.
 * Callers are emitters and do not branch on it; the return exists for the
 * backfill, which counts.
 *
 * @param {object}  input
 * @param {string}  input.email
 * @param {string}  input.eventType      a `LEAD_EVENT_TYPE` value
 * @param {Date}    [input.occurredAt]   defaults to now; a backfill passes the source row's timestamp
 * @param {string}  [input.sourceType]   `LEAD_EVENT_SOURCE_TYPE`
 * @param {string}  [input.sourceId]
 * @param {object}  [input.metadata]
 * @param {string}  [input.enrollmentId]
 * @param {string}  [input.nodeRunId]
 * @param {string}  [input.dedupeKey]    unique; a second call with the same key is a no-op
 * @param {object}  [options]
 * @param {import("sequelize").Transaction} [options.transaction]
 */
export const recordLeadEvent = async (input = {}, options = {}) => {
  try {
    const email = normaliseEmail(input.email);

    // Not an error. Plenty of source rows have no email — an anonymous
    // download, a lesson completed by an account that signed up with a phone —
    // and there is nothing to attach the event to.
    if (!email) return null;

    if (!Object.values(LEAD_EVENT_TYPE).includes(input.eventType)) {
      logger.error("Unknown lead event type, not recorded", {
        eventType: input.eventType,
        email,
      });
      return null;
    }

    const values = {
      email,
      eventType: input.eventType,
      occurredAt: input.occurredAt || new Date(),
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ? String(input.sourceId) : null,
      metadata: input.metadata ?? {},
      enrollmentId: input.enrollmentId ?? null,
      nodeRunId: input.nodeRunId ?? null,
      dedupeKey: input.dedupeKey ?? null,
    };

    // Without a dedupe key every call is a new row, and that is correct: two
    // form submissions from one address are two events, not one recorded twice.
    const { LeadEvent } = await getModels();

    if (!input.dedupeKey) {
      const row = await LeadEvent.create(values, {
        transaction: options.transaction,
      });

      wake(values.email, values.eventType);

      return row;
    }

    const [row, created] = await LeadEvent.findOrCreate({
      where: { dedupeKey: input.dedupeKey },
      defaults: values,
      transaction: options.transaction,
    });

    if (created) wake(values.email, values.eventType);

    return created ? row : null;
  } catch (error) {
    // Includes the unique-violation race that `findOrCreate` cannot close on
    // its own: two concurrent calls with the same dedupe key. Losing that
    // second write is the correct outcome, and it is not worth a distinct
    // branch — a duplicate and a genuine failure both mean "no row was added",
    // and the log line says which.
    logger.error("Failed to record lead event", {
      eventType: input?.eventType,
      email: input?.email,
      error: error.message,
    });
    return null;
  }
};

/**
 * Fire-and-forget wrapper for model hooks and controllers.
 *
 * Deliberately not awaited by callers, and deliberately transaction-aware: when
 * the caller is inside a transaction the write is deferred to `afterCommit`, so
 * a rolled-back registration leaves no trace of having happened. Sequelize
 * hooks run *before* commit, so without this every emitter would record events
 * for rows that never existed.
 *
 * @param {object} input     as `recordLeadEvent`
 * @param {object} [options] Sequelize hook options — `{ transaction }`
 */
export const emitLeadEvent = (input, options = {}) => {
  const fire = () => {
    // Detached on purpose: nothing upstream should be able to await, and
    // therefore be delayed by, a timeline write.
    void recordLeadEvent(input);
  };

  if (options.transaction) {
    options.transaction.afterCommit(fire);
    return;
  }

  fire();
};
