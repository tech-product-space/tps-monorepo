"use strict";

/**
 * Widens `subscribers` from "newsletter signups" to "every email address we
 * hold and its consent state" — it is now the suppression list for marketing
 * campaigns too. See MARKETING_CAMPAIGN_PLAN.md §3.4.
 *
 * Additive only. `status` already exists and already defaults to 'active', so
 * every existing row keeps its meaning and the Active count is unchanged.
 */
export default {
  async up(queryInterface, Sequelize) {
    // Not `updatedAt` — any edit to the row moves that, and we need the moment
    // consent was withdrawn to survive later edits.
    await queryInterface.addColumn("subscribers", "unsubscribedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("subscribers", "unsubscribeReason", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // No foreign key: campaigns do not exist yet (phase 2), and a campaign
    // being deleted must never cascade away the consent record it produced.
    await queryInterface.addColumn(
      "subscribers",
      "unsubscribedFromCampaignId",
      {
        type: Sequelize.STRING,
        allowNull: true,
      },
    );

    // Rows created by an unsubscribe or a CSV import carry a name; footer
    // signups never will. Without it a suppressed row is just an address.
    await queryInterface.addColumn("subscribers", "name", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // No index is added here. Every send filters this table by email + status,
    // and 20260724000000-create-subscribers.js already indexes both — `email`
    // uniquely, and `status` on its own. A second index on `status` would cost
    // write throughput on every subscribe and unsubscribe and buy nothing.
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("subscribers", "name");
    await queryInterface.removeColumn(
      "subscribers",
      "unsubscribedFromCampaignId",
    );
    await queryInterface.removeColumn("subscribers", "unsubscribeReason");
    await queryInterface.removeColumn("subscribers", "unsubscribedAt");
  },
};
