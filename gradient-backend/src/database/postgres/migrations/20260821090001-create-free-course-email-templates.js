"use strict";

/**
 * One editable email per (free course, type).
 *
 * Rows rather than a JSONB blob on FreeCourses, for the same reason
 * CourseEmailTemplates is: a new email type later is a constant plus a card in
 * admin, with no migration and no risk of one save clobbering another template.
 *
 * `isEnabled` is carried over from CourseEmailTemplates — EventEmailTemplates
 * lacks it, and the gap shows: there is no way to park a half-written event
 * email without deleting it. Here, a disabled certificate email means the
 * course reads as not-ready rather than sending a draft.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("FreeCourseEmailTemplates", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      freeCourseId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "FreeCourses",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // One of FREE_COURSE_EMAIL_TYPES. Today: CERTIFICATE.
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

      // Lets an admin park a draft without it going out.
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

    await queryInterface.addConstraint("FreeCourseEmailTemplates", {
      fields: ["freeCourseId", "type"],
      type: "unique",
      name: "free_course_email_templates_course_type_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("FreeCourseEmailTemplates");
  },
};
