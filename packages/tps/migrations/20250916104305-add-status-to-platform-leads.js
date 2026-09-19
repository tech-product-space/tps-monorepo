"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("platform_leads", "status", {
      type: Sequelize.ENUM(
        "Not interested",
        "Positive",
        "Hot Lead",
        "Next Cohort",
        "Paid"
      ),
      allowNull: false,
      defaultValue: "Positive",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("platform_leads", "status");
  },
};
