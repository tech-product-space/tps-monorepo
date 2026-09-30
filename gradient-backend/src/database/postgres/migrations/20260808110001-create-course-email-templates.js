"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CourseEmailTemplates", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      courseId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "Courses",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      type: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      subject: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      isEnabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    // One template per type per course — the upsert in the admin API relies on
    // this to decide between insert and update.
    await queryInterface.addConstraint("CourseEmailTemplates", {
      fields: ["courseId", "type"],
      type: "unique",
      name: "course_email_templates_course_id_type_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("CourseEmailTemplates");
  },
};
