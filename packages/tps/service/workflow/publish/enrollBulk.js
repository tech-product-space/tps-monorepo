"use strict";

const {
  Workflow,
  WorkflowVersion,
  WorkflowEnrollment,
  LeadConsent,
  Unsubscribe,
  sequelize,
} = require("../../../models");
const { Op } = require("sequelize");
const {
  WORKFLOW_STATUS,
  ENROLLMENT_STATUS,
  ENROLLMENT_SOURCE,
  TRIGGER_TYPE,
  NODE_TYPE,
} = require("../../../constants/workflow");
const {
  buildRecipients,
} = require("../../campaign/campaignRecipientBuilder");
const { enqueueAdvance } = require("../../../queues/workflowQueues");
const { computeDelayMs } = require("../engine/utils/computeDelay");
const { pickDefaultNextNode } = require("../engine/utils/pickNextNode");
const {
  resolveCap: resolveActiveWorkflowCap,
} = require("../compliance/enrollmentCap");

const DEFAULT_BATCH_SIZE = 100;
const CHUNK_INSERT_SIZE = 200;

/**
 * BullMQ handler for `workflow.bulk-enroll` jobs.
 *
 * Job data shape:
 *   { workflow_id, run_id }
 *
 * Steps:
 *   1. Load workflow (must be active, trigger.static_list)
 *   2. Load pinned workflow_version (the entry node for new enrollments)
 *   3. Resolve recipients via existing buildRecipients
 *   4. Skip leads with an existing active enrollment in this workflow
 *      (partial unique index will reject duplicates anyway — pre-filter to
 *      avoid wasted INSERTs and surface counts)
 *   5. Insert enrollments in chunks within a transaction; after commit,
 *      enqueue an advance job per enrollment with a staggered delay so the
 *      effective send rate honours batch_size/minute.
 *
 * Returns { recipients_total, enrolled, skipped_already_enrolled, run_id }.
 */
async function runBulkEnroll(job) {
  const { workflow_id: workflowId, run_id: runId } = job.data || {};
  if (!workflowId || !runId) {
    return { skipped: "bad_job_data" };
  }

  const workflow = await Workflow.findByPk(workflowId);
  if (!workflow) {
    return { skipped: "workflow_not_found" };
  }
  if (workflow.status !== WORKFLOW_STATUS.ACTIVE) {
    return {
      skipped: "workflow_not_active",
      status: workflow.status,
    };
  }
  const trigger = workflow.trigger_config || {};
  if (trigger.type !== TRIGGER_TYPE.STATIC_LIST) {
    return { skipped: "wrong_trigger_type", type: trigger.type };
  }

  const triggerCfg = trigger.config || {};
  const recipientFilter = triggerCfg.recipient_filter;
  if (!recipientFilter) {
    return { skipped: "missing_recipient_filter" };
  }

  const batchSize = Number.isInteger(triggerCfg.batch_size) && triggerCfg.batch_size > 0
    ? triggerCfg.batch_size
    : DEFAULT_BATCH_SIZE;

  const version = await WorkflowVersion.findOne({
    where: {
      workflow_id: workflow.id,
      version: workflow.current_version,
    },
  });
  if (!version) {
    return { skipped: "no_published_version" };
  }
  const def = version.definition || {};
  const nodes = Array.isArray(def.nodes) ? def.nodes : [];
  const edges = Array.isArray(def.edges) ? def.edges : [];

  const entryNode = findEntryNode(nodes, edges, def.entry_node_id);
  if (!entryNode) {
    return { skipped: "no_entry_node" };
  }

  // 1. Resolve recipients via existing campaign filter system (Option A:
  //    reuse-as-library; campaign code is not modified).
  const rawRecipients = await buildRecipients(recipientFilter);
  if (!Array.isArray(rawRecipients) || rawRecipients.length === 0) {
    return {
      run_id: runId,
      recipients_total: 0,
      enrolled: 0,
      skipped_already_enrolled: 0,
    };
  }

  // 2. Pre-filter: drop leads with an existing active enrollment in this
  //    workflow. We could rely on the unique index, but pre-filtering gives
  //    accurate counts and saves wasted work.
  const dedupedRecipients = await filterOutExistingEnrollments({
    workflowId: workflow.id,
    recipients: rawRecipients,
  });

  // 2a. Pre-filter: drop opted-out leads (from either unsubscribe table).
  //     Otherwise they'd enroll and immediately cancel on the first email
  //     step, leaving phantom CANCELLED rows in the enrollments tab.
  const { eligible: consentEligibleRecipients, skipped: skippedOptedOut } =
    await filterOutOptedOut(dedupedRecipients);

  // 2b. Pre-filter: drop leads who are already at the global active-workflow
  //     cap (counted across OTHER workflows). Avoids enrolling someone who
  //     is currently active in N workflows when the cap is N.
  const cap = await resolveActiveWorkflowCap();
  const { eligible: capEligibleRecipients, skipped: skippedAtCap } =
    await filterOutCapExceeded({
      workflowId: workflow.id,
      recipients: consentEligibleRecipients,
      cap,
    });

  // 3. Insert in chunks. Per-chunk transaction so a single failing chunk
  //    doesn't roll back already-enrolled leads.
  let enrolled = 0;
  let skippedExisting = rawRecipients.length - dedupedRecipients.length;
  let staggerIndex = 0;
  const perLeadDelayMs = Math.max(60_000 / batchSize, 0);
  const entryDelayMs =
    entryNode.type === NODE_TYPE.CONTROL_DELAY
      ? computeDelayMs(entryNode.config)
      : 0;

  for (const chunk of chunkArray(capEligibleRecipients, CHUNK_INSERT_SIZE)) {
    // Collect the enrollment ids we create in this chunk so we can enqueue
    // advance jobs after the transaction commits.
    const toEnqueue = [];

    try {
      await sequelize.transaction(async (tx) => {
        for (const r of chunk) {
          const created = await WorkflowEnrollment.create(
            {
              workflow_id: workflow.id,
              workflow_version: workflow.current_version,
              lead_source_type: r.source_type,
              lead_source_id: String(r.source_id),
              lead_email_snapshot: r.email || null,
              lead_phone_snapshot: r.phone || null,
              lead_name_snapshot: r.name || null,
              status: ENROLLMENT_STATUS.ACTIVE,
              current_node_id: entryNode.id,
              enrollment_source: ENROLLMENT_SOURCE.STATIC_LIST,
              context: { run_id: runId },
              next_scheduled_at: new Date(
                Date.now() + entryDelayMs + staggerIndex * perLeadDelayMs
              ),
            },
            { transaction: tx }
          );

          toEnqueue.push({
            enrollmentId: created.id,
            nodeId: entryNode.id,
            delayMs: entryDelayMs + staggerIndex * perLeadDelayMs,
          });
          staggerIndex += 1;
        }
      });

      // Transaction committed — safe to push to Redis. If any enqueue fails
      // the reconcile cron will pick it up (next_scheduled_at < now() check).
      for (const e of toEnqueue) {
        try {
          await enqueueAdvance({
            enrollmentId: e.enrollmentId,
            nodeId: e.nodeId,
            attempt: 1,
            delayMs: e.delayMs,
          });
          enrolled += 1;
        } catch (err) {
          console.error(
            `[bulk-enroll] enqueue failed enr=${e.enrollmentId}:`,
            err.message
          );
        }
      }
    } catch (err) {
      // If a chunk transaction fails entirely (e.g., unique-constraint hit
      // because someone enrolled the same lead concurrently), skip and log.
      console.error(
        `[bulk-enroll] chunk failed (${chunk.length} leads):`,
        err.message
      );
      skippedExisting += chunk.length;
    }
  }

  return {
    run_id: runId,
    recipients_total: rawRecipients.length,
    enrolled,
    skipped_already_enrolled: skippedExisting,
    skipped_opted_out: skippedOptedOut.length,
    skipped_active_workflow_cap: skippedAtCap.length,
    active_workflow_cap: cap,
    batch_size: batchSize,
  };
}

/**
 * Drop recipients who have opted out of email.
 *
 * Post-Phase-2 of the unsubscribe consolidation, `lead_consent.email` is
 * populated, so a single email-keyed query covers both source-row matching
 * and cross-source identity matching. The legacy `unsubscribes` table is
 * checked as a fallback for any pre-migration data the backfill missed.
 */
async function filterOutOptedOut(recipients) {
  if (!recipients.length) return { eligible: [], skipped: [] };

  const emails = new Set();
  for (const r of recipients) {
    if (r.email) emails.add(r.email.trim().toLowerCase());
  }
  if (emails.size === 0) return { eligible: recipients, skipped: [] };

  const optedOut = new Set();

  const consentRows = await LeadConsent.findAll({
    where: {
      opt_out_email: true,
      email: { [Op.in]: [...emails] },
    },
    attributes: ["email"],
    raw: true,
  });
  for (const row of consentRows) {
    if (row.email) optedOut.add(row.email.toLowerCase());
  }

  // Legacy unsubscribes fallback.
  const unsubRows = await Unsubscribe.findAll({
    where: { email: { [Op.in]: [...emails] } },
    attributes: ["email"],
    raw: true,
  });
  for (const row of unsubRows) optedOut.add(row.email.toLowerCase());

  const eligible = [];
  const skipped = [];
  for (const r of recipients) {
    const e = r.email ? r.email.trim().toLowerCase() : null;
    if (e && optedOut.has(e)) skipped.push(r);
    else eligible.push(r);
  }
  return { eligible, skipped };
}

function findEntryNode(nodes, edges, explicitEntryId) {
  if (explicitEntryId) {
    const explicit = nodes.find((n) => n.id === explicitEntryId);
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

async function filterOutExistingEnrollments({ workflowId, recipients }) {
  if (recipients.length === 0) return [];

  // Identity-first: a person is "already in this workflow" if any existing
  // active/paused/waiting enrollment in this workflow shares their email,
  // phone, or source-tuple. Catches the case where the same person was
  // enrolled previously via a different source (events vs platform_leads).
  const emails = new Set();
  const phones = new Set();
  const sourceKeys = new Set();
  for (const r of recipients) {
    if (r.email) emails.add(r.email.trim().toLowerCase());
    if (r.phone) phones.add(r.phone.trim());
    sourceKeys.add(`${r.source_type}:${String(r.source_id)}`);
  }

  const orConditions = [];
  if (emails.size > 0) {
    orConditions.push(
      sequelize.where(
        sequelize.fn("LOWER", sequelize.col("lead_email_snapshot")),
        { [Op.in]: [...emails] }
      )
    );
  }
  if (phones.size > 0) {
    orConditions.push({ lead_phone_snapshot: { [Op.in]: [...phones] } });
  }
  // Source-tuple OR: build one tuple-equality per (type, id). For batching,
  // group by source_type and IN over ids — same as the original query.
  const byType = new Map();
  for (const r of recipients) {
    if (!byType.has(r.source_type)) byType.set(r.source_type, []);
    byType.get(r.source_type).push(String(r.source_id));
  }
  for (const [sourceType, ids] of byType) {
    orConditions.push({
      [Op.and]: [
        { lead_source_type: sourceType },
        { lead_source_id: ids },
      ],
    });
  }

  const rows = orConditions.length
    ? await WorkflowEnrollment.findAll({
        where: {
          workflow_id: workflowId,
          status: [
            ENROLLMENT_STATUS.ACTIVE,
            ENROLLMENT_STATUS.PAUSED,
            ENROLLMENT_STATUS.WAITING,
          ],
          [Op.or]: orConditions,
        },
        attributes: [
          "lead_email_snapshot",
          "lead_phone_snapshot",
          "lead_source_type",
          "lead_source_id",
        ],
        raw: true,
      })
    : [];

  const existingEmails = new Set();
  const existingPhones = new Set();
  const existingSourceKeys = new Set();
  for (const row of rows) {
    if (row.lead_email_snapshot) {
      existingEmails.add(row.lead_email_snapshot.toLowerCase());
    }
    if (row.lead_phone_snapshot) {
      existingPhones.add(row.lead_phone_snapshot.trim());
    }
    existingSourceKeys.add(
      `${row.lead_source_type}:${row.lead_source_id}`
    );
  }

  return recipients.filter((r) => {
    const e = r.email ? r.email.trim().toLowerCase() : null;
    const p = r.phone ? r.phone.trim() : null;
    const sKey = `${r.source_type}:${String(r.source_id)}`;
    if (e && existingEmails.has(e)) return false;
    if (p && existingPhones.has(p)) return false;
    if (existingSourceKeys.has(sKey)) return false;
    return true;
  });
}

/**
 * Partition recipients into:
 *   eligible — leads with < cap active enrollments in OTHER workflows
 *   skipped  — leads at/over the cap (returned for accurate counts only)
 *
 * Uses a single GROUP BY query per source_type to avoid N+1.
 */
async function filterOutCapExceeded({ workflowId, recipients, cap }) {
  if (recipients.length === 0) return { eligible: [], skipped: [] };

  // Identity-first: the same person who arrived via a different source
  // (events vs platform_leads) shares email/phone and is treated as one
  // person for the global cap. Source-tuple is the legacy fallback for
  // rows whose email/phone snapshots are null.
  const emails = new Set();
  const phones = new Set();
  const sourceKeys = new Set();
  for (const r of recipients) {
    if (r.email) emails.add(r.email.trim().toLowerCase());
    if (r.phone) phones.add(r.phone.trim());
    sourceKeys.add(`${r.source_type}:${String(r.source_id)}`);
  }

  const orConditions = [];
  if (emails.size > 0) {
    orConditions.push(
      sequelize.where(
        sequelize.fn("LOWER", sequelize.col("lead_email_snapshot")),
        { [Op.in]: [...emails] }
      )
    );
  }
  if (phones.size > 0) {
    orConditions.push({ lead_phone_snapshot: { [Op.in]: [...phones] } });
  }

  // Pull every active/paused/waiting enrollment in OTHER workflows whose
  // snapshot email or phone matches anyone in our recipient set.
  const rows = orConditions.length
    ? await WorkflowEnrollment.findAll({
        where: {
          workflow_id: { [Op.ne]: workflowId },
          status: [
            ENROLLMENT_STATUS.ACTIVE,
            ENROLLMENT_STATUS.PAUSED,
            ENROLLMENT_STATUS.WAITING,
          ],
          [Op.or]: orConditions,
        },
        attributes: [
          "workflow_id",
          "lead_email_snapshot",
          "lead_phone_snapshot",
          "lead_source_type",
          "lead_source_id",
        ],
        raw: true,
      })
    : [];

  // For each identity (lowercased email, trimmed phone, source-tuple),
  // collect the set of DISTINCT workflows that identity is currently in.
  const emailWf = new Map();
  const phoneWf = new Map();
  const sourceWf = new Map();
  for (const row of rows) {
    if (row.lead_email_snapshot) {
      const key = row.lead_email_snapshot.toLowerCase();
      if (!emailWf.has(key)) emailWf.set(key, new Set());
      emailWf.get(key).add(row.workflow_id);
    }
    if (row.lead_phone_snapshot) {
      const key = row.lead_phone_snapshot.trim();
      if (!phoneWf.has(key)) phoneWf.set(key, new Set());
      phoneWf.get(key).add(row.workflow_id);
    }
    const sKey = `${row.lead_source_type}:${row.lead_source_id}`;
    if (sourceKeys.has(sKey)) {
      if (!sourceWf.has(sKey)) sourceWf.set(sKey, new Set());
      sourceWf.get(sKey).add(row.workflow_id);
    }
  }

  const eligible = [];
  const skipped = [];
  for (const r of recipients) {
    const wfs = new Set();
    if (r.email) {
      const k = r.email.trim().toLowerCase();
      if (emailWf.has(k)) for (const w of emailWf.get(k)) wfs.add(w);
    }
    if (r.phone) {
      const k = r.phone.trim();
      if (phoneWf.has(k)) for (const w of phoneWf.get(k)) wfs.add(w);
    }
    const sKey = `${r.source_type}:${String(r.source_id)}`;
    if (sourceWf.has(sKey)) for (const w of sourceWf.get(sKey)) wfs.add(w);

    if (wfs.size >= cap) skipped.push(r);
    else eligible.push(r);
  }
  return { eligible, skipped };
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// eslint-disable-next-line no-unused-vars
function _pickAfterEntry(currentNodeId, edges) {
  return pickDefaultNextNode(currentNodeId, edges);
}

module.exports = { runBulkEnroll };
