"use strict";
/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("user_course_certificates", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },
      
      certificate_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      user_id: {
        type: Sequelize.INTEGER,
      },
      course_id: {
        type: Sequelize.STRING,
      },
      certificate_template_id: {
        type: Sequelize.STRING,
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("user_course_certificates");
  },
};
