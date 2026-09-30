"use strict";

const {
  Workflow,
  WorkflowVersion,
  sequelize,
} = require("../../../models");
const {
  WORKFLOW_STATUS,
  TRIGGER_TYPE,
  NODE_TYPE,
} = require("../../../constants/workflow");
const { validateDefinition } = require("../validation/dagValidator");

// Senders verified in service/mail/sendEmail.js. Keep in sync with the
// PROVIDERS map there. Email nodes whose from_email isn't in this list will
// fail to send at runtime, so we reject them at publish time.
const VERIFIED_SENDERS = new Set([
  "info@theproductspace.in",
  "akhil@theproductspace.in",
  "info@thegradient.co.in",
  "noreply@theproductspace.in",
  "noreply@gradientlearnings.org",
]);

class PublishError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "PublishError";
    this.details = details || null;
  }
}

/**
 * Promotes a draft workflow to a new active version.
 *
 * Steps:
 *   1. Lock the workflow row
 *   2. Verify status is draft
 *   3. Build the definition object from draft + trigger
 *   4. Run DAG validation
 *   5. Validate trigger config shape (Phase 2 supports static_list only)
 *   6. Validate every send_email node's from_email is a verified sender
 *   7. Snapshot into workflow_versions
 *   8. Flip workflow to active
 *
 * Returns the created WorkflowVersion record.
 * Throws PublishError on any validation failure with details.
 */
async function publishWorkflow({ workflowId, publishedBy }) {
  return sequelize.transaction(async (tx) => {
    const workflow = await Workflow.findByPk(workflowId, {
      lock: tx.LOCK.UPDATE,
      transaction: tx,
    });

    if (!workflow) {
      throw new PublishError("workflow_not_found");
    }

    if (workflow.status !== WORKFLOW_STATUS.DRAFT) {
      throw new PublishError("workflow_not_in_draft_state", {
        current_status: workflow.status,
      });
    }

    const draft = workflow.draft_definition || {};
    const definition = {
      trigger: workflow.trigger_config || null,
      nodes: draft.nodes || [],
      edges: draft.edges || [],
      settings: workflow.settings || {},
    };

    // 1. DAG validation
    const dagResult = validateDefinition(definition);
    if (!dagResult.valid) {
      throw new PublishError("validation_failed", { errors: dagResult.errors });
    }

    // 2. Trigger-specific validation (Phase 2 only supports static_list)
    const triggerErrors = validateTriggerConfig(definition.trigger);
    if (triggerErrors.length > 0) {
      throw new PublishError("trigger_invalid", { errors: triggerErrors });
    }

    // 3. Verified sender check for send_email nodes
    const senderErrors = validateSenders(definition.nodes);
    if (senderErrors.length > 0) {
      throw new PublishError("unverified_senders", { errors: senderErrors });
    }

    // 4. Snapshot to workflow_versions
    const nextVersion = (workflow.current_version || 0) + 1;
    const version = await WorkflowVersion.create(
      {
        workflow_id: workflow.id,
        version: nextVersion,
        definition,
        published_by: publishedBy || null,
        published_at: new Date(),
      },
      { transaction: tx }
    );

    // 5. Flip workflow to active
    await workflow.update(
      {
        status: WORKFLOW_STATUS.ACTIVE,
        current_version: nextVersion,
        published_at: new Date(),
      },
      { transaction: tx }
    );

    return version;
  });
}

function validateTriggerConfig(trigger) {
  const errors = [];
  if (!trigger || !trigger.type) {
    errors.push("trigger.type is required");
    return errors;
  }

  if (trigger.type === TRIGGER_TYPE.STATIC_LIST) {
    const cfg = trigger.config || {};
    const rf = cfg.recipient_filter;
    if (!rf || !Array.isArray(rf.sources) || rf.sources.length === 0) {
      errors.push(
        "trigger.config.recipient_filter.sources must be a non-empty array"
      );
    } else {
      for (const s of rf.sources) {
        if (!s || !s.type) {
          errors.push("each source in recipient_filter must have a 'type'");
        }
      }
    }
    if (
      cfg.batch_size !== undefined &&
      (!Number.isInteger(cfg.batch_size) || cfg.batch_size <= 0)
    ) {
      errors.push("trigger.config.batch_size must be a positive integer");
    }
  } else if (trigger.type === TRIGGER_TYPE.NEW_LEAD) {
    // Phase 3: realtime trigger fires when a lead arrives from any of the
    // watched sources.
    const cfg = trigger.config || {};
    const rf = cfg.recipient_filter;
    if (!rf || !Array.isArray(rf.sources) || rf.sources.length === 0) {
      errors.push(
        "trigger.config.recipient_filter.sources must be a non-empty array"
      );
    } else {
      const SUPPORTED = new Set([
        "platform_leads",
        "external_leads",
        "events",
        "resources",
        "recordings",
        "users",
      ]);
      for (const s of rf.sources) {
        if (!s || !s.type) {
          errors.push("each source in recipient_filter must have a 'type'");
          continue;
        }
        if (!SUPPORTED.has(s.type)) {
          errors.push(
            `trigger.new_lead: source '${s.type}' is not supported (allowed: ${[...SUPPORTED].join(", ")})`
          );
        }
      }
    }

  } else {
    errors.push(`unknown trigger type: ${trigger.type}`);
  }
  return errors;
}

function validateSenders(nodes) {
  const errors = [];
  for (const n of nodes) {
    if (n.type !== NODE_TYPE.ACTION_SEND_EMAIL) continue;
    const from = n.config?.from_email;
    if (!from || !VERIFIED_SENDERS.has(from)) {
      errors.push(
        `Node ${n.id}: from_email '${from}' is not a verified sender`
      );
    }
  }
  return errors;
}

module.exports = {
  publishWorkflow,
  PublishError,
  VERIFIED_SENDERS,
};
