"use strict";

/**
 * Adds leads.assigned_at — the timestamp the current agent was assigned.
 * Stays NULL when the lead has no agent.
 *
 * Backfill strategy (no destructive ops):
 *   1. For leads whose current agent matches the "new" agent on their most
 *      recent Assignment activity, copy that activity's created_at.
 *   2. For leads that have an agent but no matching Assignment row (i.e. the
 *      agent was set at lead creation and never reassigned), fall back to
 *      the lead's own created_at. Best approximation available.
 *   3. Leads without an agent keep assigned_at NULL.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("leads", "assigned_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Step 1: latest matching Assignment activity per lead
    await queryInterface.sequelize.query(`
      UPDATE leads l
      SET assigned_at = sub.created_at
      FROM (
        SELECT DISTINCT ON (a.lead_id)
          a.lead_id,
          a.created_at,
          (a.metadata->'new'->>'agent_id') AS new_agent_id
        FROM activities a
        WHERE a.type = 'Assignment'
        ORDER BY a.lead_id, a.created_at DESC
      ) sub
      WHERE l.id = sub.lead_id
        AND l.agent_id IS NOT NULL
        AND l.agent_id::text = sub.new_agent_id
    `);

    // Step 2: fallback for leads that have an agent but no Assignment row
    await queryInterface.sequelize.query(`
      UPDATE leads
      SET assigned_at = created_at
      WHERE agent_id IS NOT NULL AND assigned_at IS NULL
    `);

    await queryInterface.addIndex("leads", ["assigned_at"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("leads", ["assigned_at"]);
    await queryInterface.removeColumn("leads", "assigned_at");
  },
};
