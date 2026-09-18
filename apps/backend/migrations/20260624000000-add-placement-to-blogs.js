"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("blogs", "placement", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "blog",
    });
    await queryInterface.addColumn("blogs", "faqs", {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: [],
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("blogs", "placement");
    await queryInterface.removeColumn('blogs', 'faqs');
  },
};
