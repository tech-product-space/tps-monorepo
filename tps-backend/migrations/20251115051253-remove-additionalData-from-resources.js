"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Remove the mistakenly added column from Resources
    await queryInterface.removeColumn("Resources", "additionalData");
  },

  down: async (queryInterface, Sequelize) => {
    // (Rollback) Add the column back if needed
    await queryInterface.addColumn("Resources", "additionalData", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: {},
    });
  },
};
