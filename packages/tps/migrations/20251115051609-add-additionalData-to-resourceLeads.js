"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("ResourceLeads", "additionalData", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: {},
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("ResourceLeads", "additionalData");
  },
};
