"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("course_certificate_templates", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      courseId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "courses",
          key: "id",
        },
        onUpdate: "CASCADE",
      },

      certificateName: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      imageSize: {
        type: Sequelize.JSONB,
        allowNull: false,
      },

      fields: {
        type: Sequelize.JSONB,
        allowNull: false,
      },

      templateImage: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      emailSubject: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      emailBody: {
        type: Sequelize.TEXT,
        allowNull: true,
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

  async down(queryInterface) {
    await queryInterface.dropTable("course_certificate_templates");
  },
};
