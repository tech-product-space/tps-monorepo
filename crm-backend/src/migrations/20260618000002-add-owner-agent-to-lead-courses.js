"use strict";

/**
 * Adds lead_courses.owner_agent_id — a snapshot of the lead owner at enroll
 * time. Before this column, enrollment ownership (and the dashboard credit
 * derived from it) was recomputed live from leads.agent_id, so reassigning a
 * lead moved its past enrollments to the new owner. Freezing the owner here
 * keeps an enrollment with whoever owned the lead when it was created.
 *
 * NULL = "unassigned / other" (no Agent/Manager owned a lead on the profile
 * at enroll time, or the resolved owner has since been removed).
 *
 * Backfill ("snapshot current owner now"): for each existing enrollment, pick
 * the canonical owner of its profile using the SAME priority order the
 * enrollment list already uses to display the owner column —
 *   1. active Agent/Manager  2. active Superadmin  3. inactive owner
 *   4. unassigned (agent_id IS NULL)
 * breaking ties by most recent lead (source_created_at, then created_at).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("lead_courses", "owner_agent_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    // Backfill from current ownership using the canonical priority order.
    await queryInterface.sequelize.query(`
      UPDATE lead_courses lc
      SET owner_agent_id = owner.agent_id
      FROM (
        SELECT DISTINCT ON (l.profile_id)
          l.profile_id,
          l.agent_id
        FROM leads l
        LEFT JOIN users u ON u.id = l.agent_id
        WHERE l.is_deleted = false
        ORDER BY
          l.profile_id,
          CASE
            WHEN u.is_active = true AND u.role IN ('Agent', 'Manager') THEN 0
            WHEN u.is_active = true                                    THEN 1
            WHEN l.agent_id IS NULL                                    THEN 3
            ELSE 2
          END,
          l.source_created_at DESC NULLS LAST,
          l.created_at        DESC NULLS LAST
      ) owner
      WHERE owner.profile_id = lc.lead_profile_id
    `);

    await queryInterface.addIndex("lead_courses", ["owner_agent_id"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("lead_courses", ["owner_agent_id"]);
    await queryInterface.removeColumn("lead_courses", "owner_agent_id");
  },
};
