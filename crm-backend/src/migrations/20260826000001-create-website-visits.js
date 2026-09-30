'use strict';

/**
 * One row per visit TPS tells us about.
 *
 * Two jobs, and the first is the one that matters most:
 *
 * 1. It is the duplicate guard. `source_event_id` is TPS's own record id and is
 *    UNIQUE here, so a visit that arrives twice — the live send AND the hourly
 *    catch-up, or a catch-up run twice — is rejected by the database rather than
 *    by application logic that could drift. Without this, every re-delivery would
 *    write another Activity row on the lead and bump it back to the top of the
 *    agent's list for no reason.
 *
 * 2. It is the person's browsing history (Part 2 of the plan). Nothing here is
 *    ever overwritten, unlike the lead — which only ever carries the *latest*
 *    page. The two surfaces need opposite things, so they are stored separately.
 *
 * `profile_id` is nullable on purpose. A visitor contact can exist with an email
 * and no phone, and a person in this CRM must have a phone — so those visits can
 * never become a lead. We still keep them: if that person is identified later,
 * the rows can be linked up rather than lost.
 *
 * `entry_type` is always 'page_view' today. It is the seam that lets "filled in a
 * form", "booked a call", "opened an email" join the same timeline later without
 * rebuilding the screen that reads it.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('website_visits', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },

      // TPS's VisitorNotificationHistory.id. The idempotency key — see above.
      source_event_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },

      // TPS's per-browser id. One person can have several (phone + laptop), which
      // is why the history hangs off profile_id and not this.
      visitor_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },

      // NULL when we could not identify the person — see header.
      profile_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'lead_profiles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },

      // The Website Visitors lead this visit created or updated. NULL when no
      // lead could be made (no phone).
      lead_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'leads', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      // Snapshot of what TPS knew at the time. Kept even after profile_id is set,
      // so an unmatched row can still be read by a human deciding who it is.
      name: { type: Sequelize.STRING(150), allowNull: true },
      email: { type: Sequelize.STRING(255), allowNull: true },
      phone: { type: Sequelize.STRING(20), allowNull: true },

      page_url: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },

      // Human-readable form of page_url for the table column, resolved on the way
      // in so the UI never has to parse a path.
      page_label: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },

      // The subsource this page maps to — 'Others' when nothing matches. Stored
      // rather than derived so a later change to the mapping does not silently
      // rewrite what agents already saw.
      section: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },

      entry_type: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'page_view',
      },

      // TPS's timestamp, not ours. The catch-up can deliver hours late and the
      // history must still read in the order things actually happened.
      occurred_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // The duplicate check runs before any other work on every single delivery,
    // so it has to be an index lookup.
    await queryInterface.addIndex('website_visits', ['source_event_id'], {
      name: 'website_visits_source_event_idx',
      unique: true,
    });

    // Drives the Website tab on the profile and the detail panel.
    await queryInterface.addIndex('website_visits', ['profile_id', 'occurred_at'], {
      name: 'website_visits_profile_time_idx',
    });

    // Used to resolve "which person is this browser?" without touching leads.
    await queryInterface.addIndex('website_visits', ['visitor_id'], {
      name: 'website_visits_visitor_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('website_visits');
  },
};
