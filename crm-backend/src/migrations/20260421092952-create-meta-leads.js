"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_poll_logs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },

      form_id: {
        type: Sequelize.STRING(100),
      },

      fetched_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      new_leads: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      duplicates: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      status: {
        type: Sequelize.STRING(50),
      },

      error: {
        type: Sequelize.TEXT,
      },

      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },

      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_poll_logs");
  },
};