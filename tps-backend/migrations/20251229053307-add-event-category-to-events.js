"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Events", "eventCategory", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "Normal",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Events", "eventCategory");
  },
};
