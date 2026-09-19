"use strict";

const { Op } = require("sequelize");
const {
  sequelize,
  Workflow,
  WorkflowVersion,
  WorkflowEnrollment,
} = require("../../models");
const {
  WORKFLOW_STATUS,
  ENROLLMENT_STATUS,
  ENROLLMENT_SOURCE,
  NODE_TYPE,
} = require("../../constants/workflow");
const {
  validateDefinition,
} = require("../../service/workflow/validation/dagValidator");
const {
  publishWorkflow,
  PublishError,
} = require("../../service/workflow/publish/publishWorkflow");
const {
  enqueueBulkEnroll,
  enqueueAdvance,
} = require("../../queues/workflowQueues");
const { ulid } = require("ulid");
const {
  loadLead,
} = require("../../service/workflow/triggers/leadLoader");
const {
  findEntryNode,
} = require("../../service/workflow/engine/triggerEvaluator");
const {
  computeDelayMs,
} = require("../../service/workflow/engine/utils/computeDelay");
const { interpolate } = require("../../service/workflow/engine/utils/interpolate");
const sendEmail = require("../../service/mail/sendEmail");
const {
  cleanHtml,
  wrapEmailTemplate,
} = require("../../utils/email/htmlHelpers");
const {
  canEnrollLead,
} = require("../../service/workflow/compliance/enrollmentCap");

exports.createWorkflow = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "name is required" });
    }

    const workflow = await Workflow.create({
      name: name.trim(),
      description: description || null,
      status: WORKFLOW_STATUS.DRAFT,
      created_by: req.user?.id || null,
    });

    return res.status(201).json({ workflow });
  } catch (error) {
    console.error("createWorkflow error:", error);
    return res.status(500).json({ message: "Failed to create workflow" });
  }
};

exports.updateWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await Workflow.findByPk(id);

    if (!workflow) {
      return res.status(404).json({ message: "Workflow not found" });
    }

    if (workflow.status === WORKFLOW_STATUS.ARCHIVED) {
      return res
        .status(409)
        .json({ message: "Cannot edit an archived workflow" });
    }

    // Two tiers of editable fields:
    //   - SAFE_ANYTIME: runtime metadata or live-read guardrails. Engine
    //     reads them off the Workflow row every dispatch, so they apply
    //     immediately without a republish. Editable in active/paused too.
    //   - DRAFT_ONLY: change the *behavior* of the workflow (flow shape,
    //     trigger). Must go through a republish so versioned enrollments
    //     stay deterministic.
    const SAFE_ANYTIME = new Set(["name", "description", "settings"]);
    const DRAFT_ONLY = new Set(["trigger_config", "draft_definition"]);

    const patch = {};
    const blocked = [];
    for (const key of [...SAFE_ANYTIME, ...DRAFT_ONLY]) {
      if (!(key in req.body)) continue;
      if (DRAFT_ONLY.has(key) && workflow.status !== WORKFLOW_STATUS.DRAFT) {
        blocked.push(key);
        continue;
      }
      patch[key] = req.body[key];
    }

    if (blocked.length > 0) {
      return res.status(409).json({
        message: `Field(s) ${blocked.join(", ")} can only be edited while the workflow is in draft. Revert to draft to change the flow, or update settings/name/description directly.`,
      });
    }

    if ("name" in patch) {
      if (typeof patch.name !== "string" || !patch.name.trim()) {
        return res.status(400).json({ message: "name must be a non-empty string" });
      }
      patch.name = patch.name.trim();
    }

    if ("settings" in patch) {
      if (patch.settings === null || typeof patch.settings !== "object") {
        return res
          .status(400)
          .json({ message: "settings must be an object" });
      }
      // The daily message cap moved to system-wide workflow_global_settings.
      // Strip any leftover per-workflow value silently so old clients keep
      // working but never write to a field the engine no longer reads.
      if ("max_messages_per_day_per_lead" in patch.settings) {
        delete patch.settings.max_messages_per_day_per_lead;
      }
    }

    await workflow.update(patch);

    return res.status(200).json({ workflow });
  } catch (error) {
    console.error("updateWorkflow error:", error);
    return res.status(500).json({ message: "Failed to update workflow" });
  }
};

// Clone a workflow's flow + trigger into a new draft. Settings (frequency
// caps, description) and runtime state (versions, enrollments, published_at)
// intentionally reset — the copy starts fresh and must be republished. Node
// IDs are kept as-is: they only need to be unique within a single workflow's
// definition JSON, and copying them avoids rewriting every edge's from/to.
exports.duplicateWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const source = await Workflow.findByPk(id);
    if (!source) {
      return res.status(404).json({ message: "Workflow not found" });
    }

    const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

    const copy = await Workflow.create({
      name: `Copy of ${source.name}`,
      description: null,
      status: WORKFLOW_STATUS.DRAFT,
      current_version: null,
      trigger_config: clone(source.trigger_config),
      draft_definition: clone(source.draft_definition),
      settings: {},
      created_by: req.user?.id || null,
      published_at: null,
    });

    return res.status(201).json({ workflow: copy });
  } catch (error) {
    console.error("duplicateWorkflow error:", error);
    return res.status(500).json({ message: "Failed to duplicate workflow" });
  }
};

exports.validateWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await Workflow.findByPk(id);

    if (!workflow) {
      return res.status(404).json({ message: "Workflow not found" });
    }

    const def = {
      trigger: workflow.trigger_config,
      nodes: workflow.draft_definition?.nodes,
      edges: workflow.draft_definition?.edges,
    };

    const result = validateDefinition(def);
    return res.status(200).json(result);
  } catch (error) {
    console.error("validateWorkflow error:", error);
    return res.status(500).json({ message: "Failed to validate workflow" });
  }
};

exports.listWorkflows = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      100
    );
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.status) {
      where.status = req.query.status;
    } else {
      // Default list excludes archived — admins explicitly tab into the
      // Archived view if they need to see them. Without this, archived
      // workflows reappear on auto-refresh after the user dismisses them.
      where.status = { [Op.ne]: WORKFLOW_STATUS.ARCHIVED };
    }
    if (req.query.q) where.name = { [Op.iLike]: `%${req.query.q}%` };

    const { rows, count } = await Workflow.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    // Attach per-workflow active enrollment counts in one extra query.
    // Cheap because workflow_enrollments has an index on (workflow_id, status).
    const ids = rows.map((r) => r.id);
    let activeMap = {};
    if (ids.length > 0) {
      const counts = await WorkflowEnrollment.findAll({
        where: {
          workflow_id: { [Op.in]: ids },
          status: ENROLLMENT_STATUS.ACTIVE,
        },
        attributes: [
          "workflow_id",
          [
            require("sequelize").fn(
              "COUNT",
              require("sequelize").col("id")
            ),
            "active_count",
          ],
        ],
        group: ["workflow_id"],
        raw: true,
      });
      for (const c of counts) {
        activeMap[c.workflow_id] = parseInt(c.active_count, 10) || 0;
      }
    }

    const items = rows.map((r) => {
      const json = r.toJSON();
      return {
        ...json,
        active_enrollments: activeMap[r.id] || 0,
        trigger_type: json.trigger_config?.type || null,
      };
    });

    return res.status(200).json({
      items,
      total: count,
      page,
      limit,
    });
  } catch (error) {
    console.error("listWorkflows error:", error);
    return res.status(500).json({ message: "Failed to list workflows" });
  }
};

exports.getWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await Workflow.findByPk(id);

    if (!workflow) {
      return res.status(404).json({ message: "Workflow not found" });
    }

    let activeVersion = null;
    if (workflow.current_version != null) {
      activeVersion = await WorkflowVersion.findOne({
        where: {
          workflow_id: workflow.id,
          version: workflow.current_version,
        },
      });
    }

    const [active, completed, failed, cancelled] = await Promise.all([
      WorkflowEnrollment.count({
        where: { workflow_id: id, status: ENROLLMENT_STATUS.ACTIVE },
      }),
      WorkflowEnrollment.count({
        where: { workflow_id: id, status: ENROLLMENT_STATUS.COMPLETED },
      }),
      WorkflowEnrollment.count({
        where: { workflow_id: id, status: ENROLLMENT_STATUS.FAILED },
      }),
      WorkflowEnrollment.count({
        where: { workflow_id: id, status: ENROLLMENT_STATUS.CANCELLED },
      }),
    ]);

    return res.status(200).json({
      workflow,
      active_version: activeVersion,
      stats: {
        enrollments_active: active,
        enrollments_completed: completed,
        enrollments_failed: failed,
        enrollments_cancelled: cancelled,
      },
    });
  } catch (error) {
    console.error("getWorkflow error:", error);
    return res.status(500).json({ message: "Failed to fetch workflow" });
  }
};

exports.publishWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const version = await publishWorkflow({
      workflowId: id,
      publishedBy: req.user?.id || null,
    });
    return res.status(200).json({
      message: "Workflow published",
      workflow_id: id,
      version: version.version,
      published_at: version.published_at,
    });
  } catch (error) {
    if (error instanceof PublishError) {
      const status =
        error.message === "workflow_not_found"
          ? 404
          : error.message === "workflow_not_in_draft_state"
          ? 409
          : 400;
      return res.status(status).json({
        message: error.message,
        details: error.details || null,
      });
    }
    console.error("publishWorkflow error:", error);
    return res.status(500).json({ message: "Failed to publish workflow" });
  }
};

exports.runWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await Workflow.findByPk(id);
    if (!workflow) {
      return res.status(404).json({ message: "Workflow not found" });
    }
    if (workflow.status !== WORKFLOW_STATUS.ACTIVE) {
      return res.status(409).json({
        message: "Workflow must be active to run",
        current_status: workflow.status,
      });
    }
    if (workflow.trigger_config?.type !== "trigger.static_list") {
      return res.status(409).json({
        message: "Run is only supported for trigger.static_list workflows",
        trigger_type: workflow.trigger_config?.type || null,
      });
    }

    const runId = ulid();
    await enqueueBulkEnroll({ workflowId: workflow.id, runId });

    return res.status(202).json({
      message: "Bulk enrollment queued",
      workflow_id: workflow.id,
      run_id: runId,
    });
  } catch (error) {
    console.error("runWorkflow error:", error);
    return res.status(500).json({ message: "Failed to queue workflow run" });
  }
};

/**
 * POST /api/v1/workflows/:id/enroll-one
 * Body: { lead_source_type, lead_source_id }
 *
 * Manual escape hatch — enrolls one specific lead into a workflow without
 * waiting for the realtime trigger. Useful for testing new_lead workflows
 * before going live. Works on any active workflow regardless of trigger type.
 */
exports.enrollOne = async (req, res) => {
  try {
    const { id } = req.params;
    const { lead_source_type, lead_source_id } = req.body || {};

    if (!lead_source_type || !lead_source_id) {
      return res.status(400).json({
        message: "lead_source_type and lead_source_id are required",
      });
    }

    const workflow = await Workflow.findByPk(id);
    if (!workflow) {
      return res.status(404).json({ message: "Workflow not found" });
    }
    if (workflow.status !== WORKFLOW_STATUS.ACTIVE) {
      return res.status(409).json({
        message: "Workflow must be active",
        current_status: workflow.status,
      });
    }

    const lead = await loadLead(lead_source_type, lead_source_id);
    if (!lead) {
      return res.status(404).json({
        message: "Lead not found for given source_type/source_id",
      });
    }

    // Enforce the global active-workflow cap. Block silently with 409 so the
    // caller knows the enrollment didn't happen and why. Identity check goes
    // by email/phone so the same person enrolled via a different source
    // (e.g. previously through `events`) still counts toward the cap.
    const capDecision = await canEnrollLead({
      leadSourceType: lead.source_type,
      leadSourceId: lead.source_id,
      leadEmail: lead.email,
      leadPhone: lead.phone,
      workflowId: workflow.id,
    });
    if (!capDecision.allowed) {
      return res.status(409).json({
        message: `Lead is already active in ${capDecision.current} workflow(s); cap is ${capDecision.cap}. Raise the cap in Workflow settings or wait for one of the lead's current workflows to finish.`,
        reason: capDecision.reason,
        current: capDecision.current,
        cap: capDecision.cap,
      });
    }

    const version = await WorkflowVersion.findOne({
      where: { workflow_id: workflow.id, version: workflow.current_version },
    });
    if (!version) {
      return res
        .status(500)
        .json({ message: "Workflow version not found (internal)" });
    }

    const entry = findEntryNode(version.definition);
    if (!entry) {
      return res
        .status(500)
        .json({ message: "Workflow definition has no entry node" });
    }

    const entryDelayMs =
      entry.type === NODE_TYPE.CONTROL_DELAY
        ? computeDelayMs(entry.config)
        : 0;

    let enrollmentId = null;
    try {
      await sequelize.transaction(async (tx) => {
        const enrollment = await WorkflowEnrollment.create(
          {
            workflow_id: workflow.id,
            workflow_version: workflow.current_version,
            lead_source_type: lead.source_type,
            lead_source_id: lead.source_id,
            lead_email_snapshot: lead.email,
            lead_phone_snapshot: lead.phone,
            lead_name_snapshot: lead.name,
            status: ENROLLMENT_STATUS.ACTIVE,
            current_node_id: entry.id,
            enrollment_source: ENROLLMENT_SOURCE.MANUAL,
            context: { manual_enroll_by: req.user?.id || null },
            next_scheduled_at: new Date(Date.now() + entryDelayMs),
          },
          { transaction: tx }
        );
        enrollmentId = enrollment.id;

        tx.afterCommit(() => {
          enqueueAdvance({
            enrollmentId: enrollment.id,
            nodeId: entry.id,
            attempt: 1,
            delayMs: entryDelayMs,
          }).catch((e) =>
            console.error("[enroll-one] enqueue failed:", e.message)
          );
        });
      });
    } catch (err) {
      if (
        err.name === "SequelizeUniqueConstraintError" ||
        /unique/i.test(err.message)
      ) {
        return res.status(409).json({
          message: "Lead already has an active enrollment in this workflow",
        });
      }
      throw err;
    }

    return res.status(201).json({
      message: "Enrolled",
      enrollment_id: enrollmentId,
    });
  } catch (error) {
    console.error("enrollOne error:", error);
    return res.status(500).json({ message: "Failed to enroll lead" });
  }
};

exports.pauseWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await Workflow.findByPk(id);
    if (!workflow) {
      return res.status(404).json({ message: "Workflow not found" });
    }
    if (workflow.status !== WORKFLOW_STATUS.ACTIVE) {
      return res.status(409).json({
        message: "Only active workflows can be paused",
        current_status: workflow.status,
      });
    }
    await workflow.update({ status: WORKFLOW_STATUS.PAUSED });
    return res.status(200).json({ workflow });
  } catch (error) {
    console.error("pauseWorkflow error:", error);
    return res.status(500).json({ message: "Failed to pause workflow" });
  }
};

exports.resumeWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await Workflow.findByPk(id);
    if (!workflow) {
      return res.status(404).json({ message: "Workflow not found" });
    }
    if (workflow.status !== WORKFLOW_STATUS.PAUSED) {
      return res.status(409).json({
        message: "Only paused workflows can be resumed",
        current_status: workflow.status,
      });
    }
    await workflow.update({ status: WORKFLOW_STATUS.ACTIVE });
    return res.status(200).json({ workflow });
  } catch (error) {
    console.error("resumeWorkflow error:", error);
    return res.status(500).json({ message: "Failed to resume workflow" });
  }
};

exports.archiveWorkflow = async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await Workflow.findByPk(id);

    if (!workflow) {
      return res.status(404).json({ message: "Workflow not found" });
    }

    if (workflow.status === WORKFLOW_STATUS.ARCHIVED) {
      return res.status(204).send();
    }

    const activeCount = await WorkflowEnrollment.count({
      where: { workflow_id: id, status: ENROLLMENT_STATUS.ACTIVE },
    });

    if (activeCount > 0) {
      return res.status(409).json({
        message: "Cannot archive workflow with active enrollments",
        active_count: activeCount,
      });
    }

    await workflow.update({ status: WORKFLOW_STATUS.ARCHIVED });
    return res.status(204).send();
  } catch (error) {
    console.error("archiveWorkflow error:", error);
    return res.status(500).json({ message: "Failed to archive workflow" });
  }
};

/**
 * Sends a real email to an admin-supplied address using the exact same
 * config the admin is composing (subject, html_body, from). Lets them
 * verify rendering + SES/Graph delivery without touching opt-out or
 * frequency-cap pipelines.
 *
 * Body: { subject, html_body, from_email, from_name, to_email }
 */
exports.sendTestEmail = async (req, res) => {
  try {
    const { subject, html_body, from_email, from_name, to_email } =
      req.body || {};

    if (typeof subject !== "string" || !subject.trim()) {
      return res.status(400).json({ message: "subject is required" });
    }
    if (typeof html_body !== "string" || !html_body.trim()) {
      return res.status(400).json({ message: "html_body is required" });
    }
    if (typeof from_email !== "string" || !from_email.includes("@")) {
      return res.status(400).json({ message: "from_email is required" });
    }
    if (typeof from_name !== "string" || !from_name.trim()) {
      return res.status(400).json({ message: "from_name is required" });
    }
    if (typeof to_email !== "string" || !to_email.includes("@")) {
      return res.status(400).json({ message: "to_email is required" });
    }

    // Use the same template tokens the engine uses, with sample values so
    // {{name}} etc. don't render as blank.
    const scope = {
      name: "Test User",
      email: to_email,
      phone: "+91 90000 00000",
      lead: {
        name: "Test User",
        email: to_email,
        phone: "+91 90000 00000",
      },
    };

    const renderedSubject = `[TEST] ${interpolate(subject, scope)}`;
    // Run the same html cleanup + outer wrapper the real send path uses,
    // so the test email visually matches what the lead will actually receive.
    // No unsubscribe link in tests (test sends bypass opt-out/tracking).
    // Convert authored newlines to <br> (same as the campaign pipeline and the
    // real workflow send path in emailDispatcher) so the test email matches what
    // the lead actually receives — and matches what the editor shows.
    const renderedHtml = wrapEmailTemplate(
      cleanHtml(interpolate(html_body, scope) || "").replace(/\n/g, "<br>")
    );

    const result = await sendEmail({
      to: to_email,
      subject: renderedSubject,
      html: renderedHtml,
      from: from_email,
      fromName: from_name,
    });

    if (result !== "success") {
      return res
        .status(502)
        .json({ message: "Email provider rejected the message" });
    }

    return res.status(200).json({ message: "Test email sent" });
  } catch (error) {
    console.error("sendTestEmail error:", error);
    return res.status(500).json({ message: "Failed to send test email" });
  }
};
