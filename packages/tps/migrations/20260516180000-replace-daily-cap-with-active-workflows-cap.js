"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop the obsolete daily-message cap and replace it with the
    // active-workflow-enrollments-per-lead cap. The old field caused legitimate
    // multi-step drip sends inside a single workflow to be skipped.
    await queryInterface.removeColumn(
      "workflow_global_settings",
      "max_messages_per_day_per_lead"
    );

    await queryInterface.addColumn(
      "workflow_global_settings",
      "max_active_workflows_per_lead",
      {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      }
    );

    // Seed the singleton row's value explicitly so existing installs pick
    // up the new default instead of leaving the column at NULL → undefined.
    await queryInterface.sequelize.query(
      `UPDATE workflow_global_settings SET max_active_workflows_per_lead = 1 WHERE id = 1`
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      "workflow_global_settings",
      "max_active_workflows_per_lead"
    );
    await queryInterface.addColumn(
      "workflow_global_settings",
      "max_messages_per_day_per_lead",
      {
        type: Sequelize.INTEGER,
        allowNull: true,
      }
    );
  },
};
