import { ulid } from "ulid";
import {
  LEAD_EVENT_TYPE,
  LEAD_EVENT_SOURCE_TYPE,
} from "../../../config/constants/leadEvent.js";

/**
 * What a person did, in order.
 *
 * Append-only and email-keyed. Rows are written by
 * `services/leadEvent/recordLeadEvent.service.js` and by nothing else — the
 * same single-writer rule `subscribers` has, for the same reason: an activity
 * stream that half the codebase can write in its own shape stops being
 * answerable.
 *
 * There are deliberately **no associations** to `Lead`, `EventGuest` or the
 * rest. The stream has to survive its sources: deleting a resource must not
 * delete the record that somebody downloaded it, and a person who was never a
 * `leads` row still has a timeline. `sourceType` + `sourceId` is a soft
 * pointer, resolved on read when the detail is wanted.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §4.5.
 */
export default (sequelize, DataTypes) => {
  const LeadEvent = sequelize.define(
    "LeadEvent",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      /**
       * Lowercased, trimmed. The identity for this whole feature — normalised
       * in one helper in the recorder, never at the call site.
       */
      email: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      eventType: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [Object.values(LEAD_EVENT_TYPE)],
        },
      },

      /**
       * When it happened, which is not always when the row was written — a
       * backfill sets this from the source row's `createdAt`, and the two are
       * years apart. Order the timeline by this, never by `createdAt`.
       */
      occurredAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      sourceType: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [Object.values(LEAD_EVENT_SOURCE_TYPE)],
        },
      },

      /** Primary key in the `sourceType` table. Soft pointer, never a FK. */
      sourceId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * What a workflow condition matches on: `{ eventId }`, `{ courseId }`,
       * `{ resourceId }`, `{ from, to }`. Queried with the JSONB containment
       * operator, so keys must be stable — a condition saved today has to keep
       * matching a row written next year.
       */
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /** Set only when a workflow caused the event. Null for everything else. */
      enrollmentId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      nodeRunId: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /**
       * Idempotency. Unique where not null, so the recorder can be called
       * twice for the same fact without a duplicate — which is exactly what a
       * re-run backfill, a retried job and a redelivered queue message all do.
       */
      dedupeKey: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
    },
    {
      tableName: "lead_events",
      // No `updatedAt`: the table is append-only. A row that can be edited is
      // not a record of what happened.
      timestamps: true,
      updatedAt: false,
    },
  );

  return LeadEvent;
};
