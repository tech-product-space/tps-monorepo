"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("EventGuests", "additionalData", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: {},
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("EventGuests", "additionalData");
  },
};
