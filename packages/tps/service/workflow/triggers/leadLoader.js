"use strict";

const {
  PlatformLead,
  ExternalLead,
  ResourceLead,
  RecordingLead,
  EventGuests,
  users,
} = require("../../../models");

// users is a Sequelize model (lowercase per its definition). Aliased for
// clarity below.
const User = users;
const { LEAD_SOURCE_TYPE } = require("../../../constants/workflow");

/**
 * Load a freshly created lead by its (source_type, source_id) identity and
 * return a normalized shape consumed by the trigger evaluator.
 *
 * Returns:
 *   {
 *     source_type, source_id,
 *     email, name, phone,        // for enrollment snapshots
 *     raw,                        // the underlying row, used by matchers
 *   }
 *   or null if the row no longer exists (e.g. deleted between insert and evaluation).
 */
async function loadLead(sourceType, sourceId) {
  if (!sourceType || !sourceId) return null;

  switch (sourceType) {
    case LEAD_SOURCE_TYPE.PLATFORM_LEADS: {
      const row = await PlatformLead.findByPk(sourceId);
      if (!row) return null;
      return {
        source_type: sourceType,
        source_id: String(row.id),
        email: row.email || null,
        name: row.name || null,
        phone: row.phone || null,
        raw: row.toJSON(),
      };
    }

    case LEAD_SOURCE_TYPE.EXTERNAL_LEADS: {
      const row = await ExternalLead.findByPk(sourceId);
      if (!row) return null;
      return {
        source_type: sourceType,
        source_id: String(row.id),
        email: row.email || null,
        name: row.name || null,
        phone: row.phone || null,
        raw: row.toJSON(),
      };
    }

    case LEAD_SOURCE_TYPE.RESOURCES: {
      const row = await ResourceLead.findByPk(sourceId);
      if (!row) return null;
      return {
        source_type: sourceType,
        source_id: String(row.id),
        email: row.email || null,
        name: row.name || null,
        phone: row.phone || null,
        raw: row.toJSON(),
      };
    }

    case LEAD_SOURCE_TYPE.RECORDINGS: {
      const row = await RecordingLead.findByPk(sourceId);
      if (!row) return null;
      return {
        source_type: sourceType,
        source_id: String(row.id),
        email: row.email || null,
        name: row.name || null,
        phone: row.phone || null,
        raw: row.toJSON(),
      };
    }

    case LEAD_SOURCE_TYPE.EVENTS: {
      // EventGuests carry no email directly — pull from joined User.
      const row = await EventGuests.findByPk(sourceId, {
        include: [{ model: users, as: "user", attributes: ["email"] }],
      });
      if (!row) return null;
      const json = row.toJSON();
      return {
        source_type: sourceType,
        source_id: String(row.id),
        email: json.user?.email || null,
        name: row.name || null,
        phone: row.phone || null,
        raw: json,
      };
    }

    case LEAD_SOURCE_TYPE.USERS: {
      // Site-wide signup (POST /user/signup). One row per registered user.
      const row = await User.findByPk(sourceId);
      if (!row) return null;
      return {
        source_type: sourceType,
        source_id: String(row.id),
        email: row.email || null,
        name: row.name || null,
        phone: row.phone || null,
        raw: row.toJSON(),
      };
    }

    default:
      // Phase 3 doesn't support contact_list — those are bulk-imported by
      // admin, not "incoming" leads, so they have no real-time trigger.
      return null;
  }
}

module.exports = { loadLead };
