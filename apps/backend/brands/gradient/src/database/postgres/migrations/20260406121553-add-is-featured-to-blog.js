"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("blogs", "isFeatured", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("blogs", "isFeatured");
  },
};