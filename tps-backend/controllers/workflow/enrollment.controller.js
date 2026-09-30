"use strict";

const { Op } = require("sequelize");
const {
  WorkflowEnrollment,
  WorkflowNodeRun,
  Workflow,
  LeadEvent,
  PlatformLead,
  ExternalLead,
  ResourceLead,
  EventGuests,
  Resource,
  MetaLeadForm,
} = require("../../models");
const {
  ENROLLMENT_STATUS,
  ENROLLMENT_SOURCE,
  LEAD_SOURCE_TYPE,
} = require("../../constants/workflow");

// Catalog of lead form `type` strings → human-readable labels. Mirrors the
// admin-side LEAD_FORM_CATALOG. Keep in sync if a new form is added there.
const LEAD_FORM_LABELS = {
  "pm-fellowship-enrollments": "PM Fellowship — Enrollment",
  "free-course-enrollments": "AI Builders 101 — Enrollment",
  "ai-for-pm-enrollments": "Generative AI Program — Enrollment",
  "pm-fellowship-download-curriculum": "PM Fellowship — Curriculum download",
  "ai-for-pm-download-curriculum": "Generative AI — Curriculum download",
  "pm-fellowship-course-counselling": "PM Fellowship Counselling Popup",
  "event-referral-counselling": "Event Referral Counselling Popup",
  "resource-download-popup": "Resource Download popup",
  "request-callback": "Global — Request callback",
};

/**
 * Resolve a human-readable description of what triggered this enrollment.
 * For realtime (new_lead): looks up the originating row and returns the
 * specific form type / event name / resource name.
 * For static_list: returns the run id from enrollment.context.
 * For manual: just labels it as manual.
 */
async function resolveTriggerSource(enrollment) {
  const kind = enrollment.enrollment_source || "new_lead";
  const base = {
    kind,
    source_type: enrollment.lead_source_type,
    source_id: enrollment.lead_source_id,
  };

  if (kind === ENROLLMENT_SOURCE.STATIC_LIST) {
    return {
      ...base,
      label: "Static list run",
      run_id: enrollment.context?.run_id || null,
    };
  }
  if (kind === ENROLLMENT_SOURCE.MANUAL) {
    return { ...base, label: "Manual enrollment" };
  }

  // new_lead — load the actual originating row for a descriptive label.
  try {
    switch (enrollment.lead_source_type) {
      case LEAD_SOURCE_TYPE.PLATFORM_LEADS: {
        const row = await PlatformLead.findByPk(enrollment.lead_source_id, {
          attributes: ["id", "type"],
        });
        const formType = row?.type || null;
        return {
          ...base,
          label: LEAD_FORM_LABELS[formType] || formType || "Website form",
          form_type: formType,
        };
      }
      case LEAD_SOURCE_TYPE.EXTERNAL_LEADS: {
        const row = await ExternalLead.findByPk(enrollment.lead_source_id, {
          attributes: ["id", "source", "external_form_id"],
        });
        if (!row) {
          return { ...base, label: "External lead (deleted)" };
        }
        if (row.source === "meta" && row.external_form_id) {
          const form = await MetaLeadForm.findOne({
            where: { form_id: row.external_form_id },
            attributes: ["form_name"],
          });
          return {
            ...base,
            label: form?.form_name
              ? `Meta form: ${form.form_name}`
              : "Meta lead",
            form_id: row.external_form_id,
          };
        }
        return { ...base, label: "External lead" };
      }
      case LEAD_SOURCE_TYPE.EVENTS: {
        const row = await EventGuests.findByPk(enrollment.lead_source_id, {
          attributes: ["id", "eventName", "eventId"],
        });
        return {
          ...base,
          label: row?.eventName
            ? `Event: ${row.eventName}`
            : "Event registration",
          event_id: row?.eventId || null,
          event_name: row?.eventName || null,
        };
      }
      case LEAD_SOURCE_TYPE.RESOURCES: {
        const row = await ResourceLead.findByPk(enrollment.lead_source_id, {
          attributes: ["id", "resourceId"],
          include: Resource
            ? [{ model: Resource, as: "resource", attributes: ["id", "name"] }]
            : [],
        });
        const resourceName = row?.resource?.name || null;
        return {
          ...base,
          label: resourceName
            ? `Resource: ${resourceName}`
            : "Resource download",
          resource_id: row?.resourceId || null,
          resource_name: resourceName,
        };
      }
      case LEAD_SOURCE_TYPE.USERS: {
        return { ...base, label: "User signup" };
      }
      default:
        return { ...base, label: enrollment.lead_source_type };
    }
  } catch (err) {
    console.error("resolveTriggerSource failed:", err.message);
    return { ...base, label: enrollment.lead_source_type || "Unknown" };
  }
}

const ALLOWED_STATUSES = new Set(Object.values(ENROLLMENT_STATUS));

exports.listEnrollments = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      100
    );
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.workflow_id) where.workflow_id = req.query.workflow_id;
    if (req.query.status) {
      if (!ALLOWED_STATUSES.has(req.query.status)) {
        return res.status(400).json({
          message: `unknown status '${req.query.status}'`,
        });
      }
      where.status = req.query.status;
    }
    if (req.query.lead_source_type)
      where.lead_source_type = req.query.lead_source_type;
    if (req.query.lead_source_id)
      where.lead_source_id = String(req.query.lead_source_id);

    const { rows, count } = await WorkflowEnrollment.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return res.status(200).json({
      items: rows,
      total: count,
      page,
      limit,
    });
  } catch (error) {
    console.error("listEnrollments error:", error);
    return res.status(500).json({ message: "Failed to list enrollments" });
  }
};

exports.getEnrollment = async (req, res) => {
  try {
    const { id } = req.params;

    const enrollment = await WorkflowEnrollment.findByPk(id, {
      include: [
        {
          model: WorkflowNodeRun,
          as: "nodeRuns",
          separate: true,
          order: [["started_at", "ASC"]],
        },
      ],
    });

    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    const workflow = await Workflow.findByPk(enrollment.workflow_id, {
      attributes: ["id", "name", "status", "current_version"],
    });

    const trigger_source = await resolveTriggerSource(enrollment);

    return res.status(200).json({ enrollment, workflow, trigger_source });
  } catch (error) {
    console.error("getEnrollment error:", error);
    return res.status(500).json({ message: "Failed to fetch enrollment" });
  }
};

// Non-terminal statuses — leads in any of these are still being processed
// by the engine and can be cancelled.
const CANCELLABLE_STATUSES = [
  ENROLLMENT_STATUS.ACTIVE,
  ENROLLMENT_STATUS.PAUSED,
  ENROLLMENT_STATUS.WAITING,
];

exports.cancelEnrollment = async (req, res) => {
  try {
    const { id } = req.params;
    const enrollment = await WorkflowEnrollment.findByPk(id);
    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    if (!CANCELLABLE_STATUSES.includes(enrollment.status)) {
      return res.status(409).json({
        message:
          "Only active, paused, or waiting enrollments can be cancelled",
        current_status: enrollment.status,
      });
    }

    await enrollment.update({
      status: ENROLLMENT_STATUS.CANCELLED,
      completed_at: new Date(),
      current_node_id: null,
      next_scheduled_at: null,
      error_reason: (req.body && req.body.reason) || "cancelled_manually",
    });

    // Note: any BullMQ jobs already in flight for this enrollment will simply
    // no-op when they fire — advanceEnrollment guards on enrollment.status.
    return res.status(200).json({ enrollment });
  } catch (error) {
    console.error("cancelEnrollment error:", error);
    return res.status(500).json({ message: "Failed to cancel enrollment" });
  }
};

/**
 * Bulk-cancel every non-terminal enrollment for a given workflow. Useful as
 * an "Archive everyone" action when an admin wants to halt a misconfigured
 * workflow run. Terminal enrollments (completed/failed/cancelled) are left
 * alone so this is safe to click repeatedly.
 *
 * Body: { workflow_id: string, reason?: string }
 * Returns: { cancelled: number }
 */
exports.bulkCancelEnrollments = async (req, res) => {
  try {
    const { workflow_id, reason } = req.body || {};
    if (!workflow_id || typeof workflow_id !== "string") {
      return res.status(400).json({ message: "workflow_id is required" });
    }

    const [cancelled] = await WorkflowEnrollment.update(
      {
        status: ENROLLMENT_STATUS.CANCELLED,
        completed_at: new Date(),
        current_node_id: null,
        next_scheduled_at: null,
        error_reason: reason || "bulk_cancelled_manually",
      },
      {
        where: {
          workflow_id,
          status: CANCELLABLE_STATUSES,
        },
      }
    );

    return res.status(200).json({ cancelled });
  } catch (error) {
    console.error("bulkCancelEnrollments error:", error);
    return res
      .status(500)
      .json({ message: "Failed to bulk-cancel enrollments" });
  }
};

exports.getEnrollmentEvents = async (req, res) => {
  try {
    const { id } = req.params;
    const enrollment = await WorkflowEnrollment.findByPk(id, {
      attributes: ["id", "lead_source_type", "lead_source_id", "enrolled_at"],
    });
    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    // Pull events tied to this enrollment AND any unattributed events for the
    // same lead since enrolment (e.g. webhook arrivals correlate by msg id).
    const events = await LeadEvent.findAll({
      where: {
        [Op.or]: [
          { enrollment_id: id },
          {
            lead_source_type: enrollment.lead_source_type,
            lead_source_id: String(enrollment.lead_source_id),
            occurred_at: { [Op.gte]: enrollment.enrolled_at },
          },
        ],
      },
      order: [["occurred_at", "ASC"]],
      limit: 500,
    });

    return res.status(200).json({
      enrollment_id: id,
      events,
    });
  } catch (error) {
    // Treat "table missing" as an empty event set so the UI keeps working
    // even when the migration hasn't been applied yet.
    if (error?.parent?.code === "42P01" || error?.original?.code === "42P01") {
      return res.status(200).json({
        enrollment_id: req.params.id,
        events: [],
      });
    }
    console.error("getEnrollmentEvents error:", error);
    return res.status(500).json({ message: "Failed to fetch enrollment events" });
  }
};

exports.getEnrollmentLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const enrollment = await WorkflowEnrollment.findByPk(id, {
      attributes: ["id", "workflow_id", "status"],
    });
    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    const runs = await WorkflowNodeRun.findAll({
      where: { enrollment_id: id },
      order: [["started_at", "ASC"]],
    });

    return res.status(200).json({
      enrollment_id: id,
      node_runs: runs,
    });
  } catch (error) {
    console.error("getEnrollmentLogs error:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch enrollment logs" });
  }
};
