'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn("Resources", "resourceSlug", {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
    });

    await queryInterface.addColumn("Resources", "additionalDetails", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: {},
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn("Resources", "resourceSlug");
    await queryInterface.removeColumn("Resources", "additionalDetails");
  }
};
