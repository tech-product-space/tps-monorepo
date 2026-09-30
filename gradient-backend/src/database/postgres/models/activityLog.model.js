import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import {
  ACTIVITY_ACTOR_TYPE,
  ACTIVITY_STATUS,
} from "../../../config/constants/activityLog.js";

/**
 * Append-only audit trail of admin panel actions.
 *
 * Two properties are load-bearing and easy to break later:
 *
 * 1. **Append-only.** Nothing updates a row, hence `updatedAt: false` and no
 *    write endpoints in the controller. A log that can be edited is not a log.
 * 2. **Actor data is denormalised.** `actorName`/`actorEmail`/`actorRole` are
 *    snapshots taken at action time, and there is deliberately no association
 *    to AdminUser — deleting an admin must not erase or blank their history.
 *    Do not add a `belongsTo(AdminUser)` here.
 */
export default (sequelize) => {
  const ActivityLog = sequelize.define(
    "ActivityLog",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      actorType: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: ACTIVITY_ACTOR_TYPE.ADMIN,
      },

      /** admin_users.id. Intentionally not a foreign key. */
      actorId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      actorName: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      actorEmail: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      actorRole: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** "<entityType>.<verb>", e.g. "course.published". */
      action: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      entityType: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      entityId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Human name at action time, so the feed renders with no joins. */
      entityLabel: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Pre-rendered sentence, only where the frontend cannot derive one. */
      summary: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      /** { "pricing.earlyBirdPrice": { from, to } } — redacted and truncated. */
      changes: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      method: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      path: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Matched route pattern, e.g. "PUT /courses/admin/courses/:id". */
      routeKey: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      statusCode: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: ACTIVITY_STATUS.SUCCESS,
      },

      ipAddress: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      userAgent: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "activity_logs",
      timestamps: true,
      updatedAt: false,
    },
  );

  return ActivityLog;
};
