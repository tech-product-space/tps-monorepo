"use strict";

/**
 * Every page view of a known visitor. One row per view, append-only.
 *
 * This is NOT VisitorNotificationHistory, and the difference is the whole point:
 *
 *   VisitorNotificationHistory   alerts we raised. The 8-hour cooldown means at
 *                                most one per person per 8 hours. It is a work
 *                                queue people read and act on.
 *
 *   VisitorActivity              every page view, including the ~4 in 5 the
 *                                cooldown suppresses. Nobody is alerted on it.
 *                                It is the browsing trail.
 *
 * Keeping them apart is deliberate. Recording page views into the notification
 * table would mean filtering them back out of the feed, the export, the unread
 * count and the mark-as-read query — forever, and the first query written later
 * without the filter becomes a silent bug. It would also drag a 5x volume
 * increase through an index and a retention policy built for something else.
 *
 * Three things worth knowing before changing this:
 *
 * 1. `id` is a UUID generated when the view is buffered, NOT a sequence. It
 *    travels to the CRM as the primary key there, so a re-sent batch collides
 *    and is discarded by Postgres with no per-row check.
 *
 *    It cannot be an integer. The CRM's website_visits.source_event_id already
 *    holds this table's *notification* ids as plain integers ('78901'), so an
 *    integer id here would start at 1 and collide with rows that already exist —
 *    brand-new views would be rejected as ancient duplicates.
 *
 * 2. `crmSyncedAt` null means the CRM has not got this row. That replaces the
 *    old catch-up's "anything from the last 3 hours" window, which silently gave
 *    up on anything older. Nothing can now fall outside a window.
 *
 * 3. The contact columns are a SNAPSHOT at the time of the view. If the visitor
 *    later submits a different phone, these rows still say who they were then,
 *    so the trail stays historically true instead of being quietly rewritten.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("VisitorActivity", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
      },

      visitorId: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // Always 'page_view' today. The seam for "scrolled to fees", "watched the
      // video", "abandoned the form" joining the same timeline later.
      type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "page_view",
      },

      page: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      // Snapshot — see (3).
      name: { type: Sequelize.STRING, allowNull: true },
      email: { type: Sequelize.STRING, allowNull: true },
      phone: { type: Sequelize.STRING, allowNull: true },

      occurredAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      // Did this view win the 8-hour slot and raise an alert? Recorded for
      // context; nothing downstream branches on it.
      notified: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      // Null means the CRM has not got it — see (2).
      crmSyncedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      // Room for scroll depth, time on page, referrer, UTM.
      meta: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    // The sweep's only question: what has the CRM not seen? Partial, because the
    // answer is almost always "a handful of rows" out of a table that grows
    // forever — a full index would be mostly wasted.
    await queryInterface.sequelize.query(
      `CREATE INDEX "visitor_activity_unsynced_idx"
         ON "VisitorActivity" ("createdAt")
       WHERE "crmSyncedAt" IS NULL`,
    );

    // One browser's trail, newest first.
    await queryInterface.addIndex("VisitorActivity", ["visitorId", "occurredAt"], {
      name: "visitor_activity_visitor_time_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("VisitorActivity");
  },
};
