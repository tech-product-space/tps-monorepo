"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workflow_global_settings", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
      },

      // Maximum email messages a single lead can receive per calendar day,
      // counted across every workflow. Null = use DEFAULT_DAILY_FREQ_CAP env.
      max_messages_per_day_per_lead: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      updated_by: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Seed the single row. The service layer always reads/writes id=1.
    await queryInterface.bulkInsert("workflow_global_settings", [
      {
        id: 1,
        max_messages_per_day_per_lead: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workflow_global_settings");
  },
};
