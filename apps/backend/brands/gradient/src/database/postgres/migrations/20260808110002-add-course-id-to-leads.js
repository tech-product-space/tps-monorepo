"use strict";

/**
 * Course enquiries stay in the shared `leads` table so the existing Leads page
 * and the CRM sync keep working untouched. This column just lets the course
 * screens count and filter their own leads without matching on `source` text.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("leads", "courseId", {
      type: Sequelize.STRING,
      allowNull: true,
      references: {
        model: "Courses",
        key: "id",
      },
      onUpdate: "CASCADE",
      // Deleting a course must never delete the leads it generated.
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("leads", ["courseId"], {
      name: "leads_course_id_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("leads", "leads_course_id_idx");
    await queryInterface.removeColumn("leads", "courseId");
  },
};
