"use strict";

/**
 * Onboarding emails become per-course.
 *
 * - Adds `course_id` to email_templates (catalog program_name the template targets).
 * - Replaces the single-column UNIQUE(type) with a composite UNIQUE(type, course_id)
 *   so each course can own one COURSE_ONBOARDING template.
 * - Indexes email_logs(lead_course_id, template_id) for cheap "already sent?" lookups.
 *
 * Existing rows keep course_id = NULL (legacy/unassigned). In Postgres NULLs are
 * distinct under a UNIQUE constraint, so this migration is safe on existing data.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("email_templates", "course_id", {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment:
        "Course this template targets (catalog program_name). NULL = legacy/unassigned.",
    });

    // Drop the inline single-column unique on `type` (Postgres names it
    // email_templates_type_key). Tolerate absence so re-runs don't explode.
    try {
      await queryInterface.removeConstraint(
        "email_templates",
        "email_templates_type_key",
      );
    } catch (e) {
      console.warn("[migration] could not drop email_templates_type_key:", e.message);
    }

    await queryInterface.addConstraint("email_templates", {
      fields: ["type", "course_id"],
      type: "unique",
      name: "email_templates_type_course_id_unique",
    });

    await queryInterface.addIndex("email_logs", ["lead_course_id", "template_id"], {
      name: "idx_email_logs_lead_course_template",
    });
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex(
        "email_logs",
        "idx_email_logs_lead_course_template",
      );
    } catch (e) {
      console.warn(e.message);
    }
    try {
      await queryInterface.removeConstraint(
        "email_templates",
        "email_templates_type_course_id_unique",
      );
    } catch (e) {
      console.warn(e.message);
    }
    await queryInterface.removeColumn("email_templates", "course_id");
    try {
      await queryInterface.addConstraint("email_templates", {
        fields: ["type"],
        type: "unique",
        name: "email_templates_type_key",
      });
    } catch (e) {
      console.warn(e.message);
    }
  },
};
