'use strict';

/**
 * Every page view of a known visitor. One row per view, append-only.
 *
 * This is NOT website_visits. The two look similar and do opposite jobs:
 *
 *   website_visits    the visits TPS raised an alert for. Each one creates or
 *                     bumps a lead, so there is at most one per person per 8
 *                     hours. It drives the Website Visitors tab.
 *
 *   website_activity  every page view, including the ~4 in 5 that the 8-hour
 *                     cooldown suppresses. It touches no lead, ever. It drives
 *                     the browsing trail on the profile.
 *
 * Three decisions worth knowing before changing anything here:
 *
 * 1. `id` is TPS's own id, not ours, and it is the primary key. That makes the
 *    duplicate guard free: a re-sent batch collides on the PK and Postgres
 *    discards it inside the same INSERT, with no per-row check. Re-sending the
 *    same 500 rows ten times changes nothing.
 *
 *    It has to be a UUID. website_visits.source_event_id holds plain integers
 *    ('78901'), so integer ids here would start at 1 and collide with rows that
 *    already exist — brand-new visits would be rejected as ancient duplicates.
 *
 * 2. There is no profile_id and no foreign key. The person is resolved at READ
 *    time by joining on the normalized phone. Two reasons:
 *
 *      - the insert does zero lookups, which is what makes a bulk write fast
 *      - it is self-healing. Someone browses today with no CRM record and
 *        enrolls next week; their history is simply there, because the join
 *        happens when you read it. No backfill, no linking job, no repair pass.
 *
 * 3. `type` is always 'page_view' today. It is the seam for "scrolled to fees",
 *    "watched the video", "abandoned the form" joining the same timeline later.
 *    `meta` is where their extra fields go without a migration.
 *
 * Rows are never updated, so there is no updated_at.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('website_activity', {
      // TPS's VisitorActivity.id, generated when the view was buffered. See (1).
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
      },

      // TPS's per-browser id. One person can have several (laptop + phone), and
      // one browser can belong to several people (shared machines) — which is
      // exactly why identity runs off the phone and not this.
      visitor_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },

      // Digits only, normalized the same way every other lead phone is. This is
      // the join key to lead_profiles. Nullable: a visitor contact can exist
      // with an email and no phone, and those views are still worth keeping.
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },

      // Contact snapshot at the moment of the view. If the person later submits
      // a different number, these rows still say who they were then, so the
      // trail stays historically true instead of being quietly rewritten.
      name: {
        type: Sequelize.STRING(150),
        allowNull: true,
      },

      email: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      // Path only, as TPS sent it.
      page_url: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },

      // Human-readable, from utils/websitePage.js — "PM Fellowship — enroll".
      page_label: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },

      // The same section names the Website Visitors subsources use.
      section: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },

      // See (3).
      type: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'page_view',
      },

      // TPS's clock, never ours. Batching delays when a row lands, never what
      // time it says — the trail has to read in the order things happened.
      occurred_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      // Room for scroll depth, time on page, referrer, UTM.
      meta: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // The read path: one person's trail, newest first.
    await queryInterface.addIndex('website_activity', ['phone', 'occurred_at'], {
      name: 'website_activity_phone_time_idx',
    });

    // Powers the "same browser, different number" section, and any later
    // question about what a single device did.
    await queryInterface.addIndex('website_activity', ['visitor_id', 'occurred_at'], {
      name: 'website_activity_visitor_time_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('website_activity');
  },
};
