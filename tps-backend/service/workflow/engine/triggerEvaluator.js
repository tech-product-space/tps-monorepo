"use strict";

const {
  sequelize,
  Workflow,
  WorkflowVersion,
  WorkflowEnrollment,
} = require("../../../models");
const {
  WORKFLOW_STATUS,
  ENROLLMENT_STATUS,
  ENROLLMENT_SOURCE,
  TRIGGER_TYPE,
} = require("../../../constants/workflow");
const { loadLead } = require("../triggers/leadLoader");
const { leadMatchesFilter } = require("../triggers/matchers");
const { enqueueAdvance } = require("../../../queues/workflowQueues");
const { computeDelayMs } = require("./utils/computeDelay");
const { NODE_TYPE } = require("../../../constants/workflow");
const { canEnrollLead } = require("../compliance/enrollmentCap");
const { buildIdentityOr } = require("../compliance/identityMatch");
const { isEmailOptedOut } = require("../compliance/optOutGuard");
const { Op } = require("sequelize");

// Statuses that count as "currently in this workflow". A lead in any of
// these is always blocked from re-entering the same workflow, regardless of
// the allow_re_enrollment flag.
const IN_FLIGHT_STATUSES = [
  ENROLLMENT_STATUS.ACTIVE,
  ENROLLMENT_STATUS.PAUSED,
  ENROLLMENT_STATUS.WAITING,
];

/**
 * Find the entry node of a workflow definition.
 *
 * 1. If `definition.entry_node_id` is set (canvas editor records this when
 *    the user draws the trigger arrow), prefer it.
 * 2. Otherwise: pick the unique node with no incoming edges. Returns null
 *    if zero or multiple such nodes exist.
 */
function findEntryNode(definition) {
  const nodes = definition?.nodes || [];
  const edges = definition?.edges || [];

  if (definition?.entry_node_id) {
    const explicit = nodes.find((n) => n.id === definition.entry_node_id);
    if (explicit) return explicit;
  }

  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    if (incoming.has(e.to)) incoming.set(e.to, incoming.get(e.to) + 1);
  }
  const entries = [...incoming.entries()].filter(([, c]) => c === 0);
  if (entries.length !== 1) return null;
  return nodes.find((n) => n.id === entries[0][0]) || null;
}

/**
 * BullMQ handler for `workflow.evaluate-triggers` jobs.
 *
 * Job data: { source_type, source_id }
 *
 * Steps:
 *   1. Load lead row + normalize
 *   2. Find all ACTIVE workflows whose trigger.type='trigger.new_lead' watch
 *      this source_type
 *   3. For each candidate, apply per-source predicate
 *   4. Run dedup + re-enrollment policy
 *   5. Create enrollment + enqueue first advance job (same TX)
 */
async function evaluateTriggers(job) {
  const { source_type: sourceType, source_id: sourceId } = job.data || {};

  if (!sourceType || !sourceId) {
    return { skipped: "bad_job_data" };
  }

  const lead = await loadLead(sourceType, sourceId);
  if (!lead) {
    console.log(
      `[trigger] lead not found src=${sourceType}:${sourceId} — row deleted before evaluation`
    );
    return { skipped: "lead_not_found", source_type: sourceType, source_id: sourceId };
  }

  // Quick filter to candidates: workflows that are active and have a trigger
  // config containing this source_type. We pull all then filter in-memory —
  // typical active-workflow counts are small (<100) and JSONB containment
  // queries aren't worth the index overhead at this scale.
  const candidates = await Workflow.findAll({
    where: { status: WORKFLOW_STATUS.ACTIVE },
  });

  if (candidates.length === 0) {
    console.log(
      `[trigger] no ACTIVE workflows in the system — src=${sourceType}:${sourceId}`
    );
  }

  let evaluated = 0;
  let enrolled = 0;
  let skippedFilter = 0;
  let skippedInFlight = 0;
  let skippedReEnroll = 0;
  let skippedActiveWorkflowCap = 0;
  let skippedOptedOut = 0;

  // Cache the opt-out check across all candidate workflows — same person,
  // same answer. Avoids a redundant query per workflow when many watch the
  // same source type.
  let leadOptedOutCache = null;
  const leadOptedOut = async () => {
    if (leadOptedOutCache !== null) return leadOptedOutCache;
    leadOptedOutCache = await isEmailOptedOut(
      sourceType,
      lead.source_id,
      lead.email
    );
    return leadOptedOutCache;
  };

  for (const workflow of candidates) {
    const trigger = workflow.trigger_config || {};
    if (trigger.type !== TRIGGER_TYPE.NEW_LEAD) continue;

    const cfg = trigger.config || {};
    const recipientFilter = cfg.recipient_filter;
    if (!recipientFilter) {
      console.log(
        `[trigger] wf=${workflow.id} (${workflow.name}) has no recipient_filter on trigger — skipping`
      );
      continue;
    }

    // Must watch this source_type
    const watchedSources = (recipientFilter.sources || []).map((s) => s.type);
    if (!watchedSources.includes(sourceType)) continue;

    evaluated += 1;

    // Apply the per-source predicate
    if (!leadMatchesFilter(lead, recipientFilter)) {
      console.log(
        `[trigger] wf=${workflow.id} (${workflow.name}) FILTER mismatch ` +
          `src=${sourceType}:${sourceId} — lead does not match recipient filter`
      );
      skippedFilter += 1;
      continue;
    }

    // Opt-out check — if this person has unsubscribed from emails (via
    // either workflow or campaign unsubscribe paths), don't enroll them.
    // Stops "phantom" enrollments that would have been cancelled on the
    // first email send anyway.
    if (await leadOptedOut()) {
      console.log(
        `[trigger] wf=${workflow.id} (${workflow.name}) OPTED OUT — ` +
          `lead has unsubscribed from emails (src=${sourceType}:${sourceId})`
      );
      skippedOptedOut += 1;
      continue;
    }

    // Identity OR-clause: this person is the same human across different
    // source rows if email or phone match (case-insensitive email, trimmed
    // phone). Source-tuple is the legacy fallback for old rows whose
    // snapshots are null.
    const identityOr = buildIdentityOr({
      leadSourceType: sourceType,
      leadSourceId: lead.source_id,
      leadEmail: lead.email,
      leadPhone: lead.phone,
    });

    // 1. Always block while the lead is currently in this workflow
    //    (active / paused / waiting). Re-entry is only ever considered
    //    after the previous run reaches a terminal status. Identity-aware
    //    so submitting two different forms (e.g. platform_leads + events)
    //    that both feed this workflow won't enroll the same person twice.
    const inFlight = await WorkflowEnrollment.count({
      where: {
        workflow_id: workflow.id,
        [Op.or]: identityOr,
        status: IN_FLIGHT_STATUSES,
      },
    });
    if (inFlight > 0) {
      console.log(
        `[trigger] wf=${workflow.id} (${workflow.name}) IN_FLIGHT — ` +
          `lead is already running this workflow (matched by email/phone/source)`
      );
      skippedInFlight += 1;
      continue;
    }

    // 2. Past run exists and re-enrollment is disabled → skip. Workflows
    //    with allow_re_enrollment=false (default) run for a given lead at
    //    most once over their lifetime — also identity-aware.
    const allowReEnroll = !!cfg.allow_re_enrollment;
    if (!allowReEnroll) {
      const everEnrolled = await WorkflowEnrollment.count({
        where: {
          workflow_id: workflow.id,
          [Op.or]: identityOr,
        },
      });
      if (everEnrolled > 0) {
        console.log(
          `[trigger] wf=${workflow.id} (${workflow.name}) PAST RUN — ` +
            `lead has already run this workflow once; allow_re_enrollment is OFF`
        );
        skippedReEnroll += 1;
        continue;
      }
    }

    // Global active-workflow cap (across all workflows). Silently skip.
    // Identify the lead by email/phone so the same person enrolled via
    // a different source (e.g. previously through `events`) still counts.
    const capDecision = await canEnrollLead({
      leadSourceType: sourceType,
      leadSourceId: lead.source_id,
      leadEmail: lead.email,
      leadPhone: lead.phone,
      workflowId: workflow.id,
    });
    if (!capDecision.allowed) {
      skippedActiveWorkflowCap += 1;
      console.log(
        `[trigger] cap blocked: lead ${sourceType}:${lead.source_id} ` +
          `is in ${capDecision.current}/${capDecision.cap} workflows; ` +
          `skipping workflow ${workflow.id}`
      );
      continue;
    }

    // Find entry node from the pinned version
    const version = await WorkflowVersion.findOne({
      where: { workflow_id: workflow.id, version: workflow.current_version },
    });
    if (!version) continue;
    const entry = findEntryNode(version.definition);
    if (!entry) continue;

    const entryDelayMs =
      entry.type === NODE_TYPE.CONTROL_DELAY
        ? computeDelayMs(entry.config)
        : 0;

    // Create enrollment + enqueue first advance (same TX)
    try {
      await sequelize.transaction(async (tx) => {
        // Serialize sibling evaluations for the same person + workflow.
        // A Meta lead mapped to several lead types inserts multiple
        // external_leads rows in the same instant, firing parallel evaluate
        // jobs — the identity checks above all ran before any of them
        // inserted, so without this lock both would enroll. The xact lock
        // releases on commit/rollback; the loser then re-checks and skips.
        const lockKey = `${workflow.id}:${(lead.email || lead.phone || lead.source_id || "").toLowerCase()}`;
        await sequelize.query(
          "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
          { replacements: { key: lockKey }, transaction: tx }
        );

        const inFlightNow = await WorkflowEnrollment.count({
          where: {
            workflow_id: workflow.id,
            [Op.or]: identityOr,
            status: IN_FLIGHT_STATUSES,
          },
          transaction: tx,
        });
        if (inFlightNow > 0) {
          const raceErr = new Error("in_flight_race");
          raceErr.code = "IN_FLIGHT_RACE";
          throw raceErr;
        }

        const enrollment = await WorkflowEnrollment.create(
          {
            workflow_id: workflow.id,
            workflow_version: workflow.current_version,
            lead_source_type: sourceType,
            lead_source_id: lead.source_id,
            lead_email_snapshot: lead.email,
            lead_phone_snapshot: lead.phone,
            lead_name_snapshot: lead.name,
            status: ENROLLMENT_STATUS.ACTIVE,
            current_node_id: entry.id,
            enrollment_source: ENROLLMENT_SOURCE.NEW_LEAD,
            context: {},
            next_scheduled_at: new Date(Date.now() + entryDelayMs),
          },
          { transaction: tx }
        );

        tx.afterCommit(() => {
          enqueueAdvance({
            enrollmentId: enrollment.id,
            nodeId: entry.id,
            attempt: 1,
            delayMs: entryDelayMs,
          }).catch((e) =>
            console.error(
              `[trigger] enqueue advance failed enr=${enrollment.id}:`,
              e.message
            )
          );
        });
      });
      enrolled += 1;
    } catch (err) {
      // Most likely cause: the partial-unique index on (workflow_id,
      // source_type, source_id) where status='active' fired because a
      // concurrent enqueue beat us to it, or the advisory-lock re-check
      // above found a sibling evaluation's enrollment. Treat both the same
      // as an in-flight block — the other run beat us to it.
      if (
        err.code === "IN_FLIGHT_RACE" ||
        err.name === "SequelizeUniqueConstraintError" ||
        /unique/i.test(err.message)
      ) {
        skippedInFlight += 1;
        continue;
      }
      console.error(
        `[trigger] enrollment failed wf=${workflow.id} lead=${sourceType}:${sourceId}:`,
        err.message
      );
    }
  }

  return {
    source_type: sourceType,
    source_id: sourceId,
    candidates: candidates.length,
    evaluated,
    enrolled,
    skipped_filter: skippedFilter,
    skipped_in_flight: skippedInFlight,
    skipped_re_enroll: skippedReEnroll,
    skipped_active_workflow_cap: skippedActiveWorkflowCap,
    skipped_opted_out: skippedOptedOut,
  };
}

module.exports = { evaluateTriggers, findEntryNode };
