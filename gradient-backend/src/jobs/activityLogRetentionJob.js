import { Op } from "sequelize";
import agenda from "../config/agenda.js";
import db from "../database/postgres/models/index.js";
import env from "../config/env.js";
import { ACTIVITY_LIMITS } from "../config/constants/activityLog.js";

const { ActivityLog } = db;

export const ACTIVITY_LOG_RETENTION_JOB = "activity-log-retention";

/**
 * Prunes activity rows past the retention window.
 *
 * Agenda is gated by AGENDA_JOBS_ENABLED and is off locally, so this job must be
 * safe to never run — it is, because the real size control is the truncation in
 * activityDiff.js, not this. Deleting is a tidiness measure, not a load-bearing
 * one.
 */
const activityLogRetentionJob = () => {
  agenda.define(ACTIVITY_LOG_RETENTION_JOB, async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ACTIVITY_LIMITS.RETENTION_DAYS);

    const deleted = await ActivityLog.destroy({
      where: { createdAt: { [Op.lt]: cutoff } },
    });

    if (deleted > 0) {
      console.log(
        `🧹 activity log: removed ${deleted} row(s) older than ${cutoff.toISOString()}`,
      );
    }
  });

  // Unlike the reminder job — which is scheduled on demand by a controller —
  // this one is recurring, so it has to register a schedule. `every` writes to
  // agenda_jobs, which is only safe once agenda has actually started, hence the
  // guard: with AGENDA_JOBS_ENABLED off the job is defined but never scheduled.
  if (!env.agendaEnabled) return;

  agenda.on("ready", () => {
    agenda
      .every("0 3 * * *", ACTIVITY_LOG_RETENTION_JOB)
      .catch((err) =>
        console.error(
          "[activityLog] could not schedule retention job:",
          err?.message,
        ),
      );
  });
};

export default activityLogRetentionJob;
