"use strict";

const {
  sequelize,
  WorkflowEnrollment,
} = require("../../models");
const {
  ENROLLMENT_STATUS,
  LEAD_SOURCE_TYPE,
} = require("../../constants/workflow");
const {
  recordOptOut,
} = require("../../service/workflow/compliance/optOutGuard");

const VALID_SOURCE_TYPES = new Set(Object.values(LEAD_SOURCE_TYPE));
const VALID_CHANNELS = new Set(["email", "whatsapp"]);

/**
 * POST /api/v1/leads/opt-out
 * Body: { lead_source_type, lead_source_id, channel, reason? }
 *
 * Records the opt-out in lead_consent AND cancels the lead's active
 * workflow enrollments — per PRD §13.1 ("Opt-out state changes must unenroll
 * the lead from all active enrollments for that channel"). In Phase 2 we
 * only ship email actions, so any active enrollment for an email-opted-out
 * lead has nothing useful left to do — cancel it.
 */
exports.optOut = async (req, res) => {
  try {
    const { lead_source_type, lead_source_id, channel, reason } = req.body || {};

    if (!lead_source_type || !VALID_SOURCE_TYPES.has(lead_source_type)) {
      return res.status(400).json({
        message: `lead_source_type must be one of: ${[...VALID_SOURCE_TYPES].join(", ")}`,
      });
    }
    if (!lead_source_id) {
      return res.status(400).json({ message: "lead_source_id is required" });
    }
    if (!channel || !VALID_CHANNELS.has(channel)) {
      return res.status(400).json({
        message: "channel must be 'email' or 'whatsapp'",
      });
    }

    let cancelledCount = 0;

    await sequelize.transaction(async (tx) => {
      // 1. Upsert opt-out flag
      await recordOptOut({
        sourceType: lead_source_type,
        sourceId: String(lead_source_id),
        channel,
        reason: reason || "user_unsubscribed",
      });

      // 2. Cancel active enrollments for this lead.
      // Phase 2 only has email actions, so opt-out → no further work.
      // Phase 4+ (multi-channel) will need to scan each workflow's nodes and
      // only cancel if all remaining nodes target the opted-out channel.
      const [affected] = await WorkflowEnrollment.update(
        {
          status: ENROLLMENT_STATUS.CANCELLED,
          completed_at: new Date(),
          current_node_id: null,
          next_scheduled_at: null,
          error_reason: `opted_out_${channel}`,
        },
        {
          where: {
            lead_source_type,
            lead_source_id: String(lead_source_id),
            status: ENROLLMENT_STATUS.ACTIVE,
          },
          transaction: tx,
        }
      );
      cancelledCount = affected || 0;
    });

    return res.status(200).json({
      message: "Opt-out recorded",
      lead_source_type,
      lead_source_id: String(lead_source_id),
      channel,
      enrollments_cancelled: cancelledCount,
    });
  } catch (error) {
    console.error("optOut error:", error);
    return res.status(500).json({ message: "Failed to record opt-out" });
  }
};
