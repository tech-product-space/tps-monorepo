"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("courses", "is_video_course", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });

    await queryInterface.removeColumn("courses", "is_free");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("courses", "is_free", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });

    await queryInterface.removeColumn("courses", "is_video_course");
  },
};
