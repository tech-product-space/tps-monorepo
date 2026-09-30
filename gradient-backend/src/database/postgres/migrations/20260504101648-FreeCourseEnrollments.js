"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("FreeCourseEnrollments", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      userId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },

      courseId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "FreeCourses",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },

      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      formData: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("FreeCourseEnrollments");
  },
};