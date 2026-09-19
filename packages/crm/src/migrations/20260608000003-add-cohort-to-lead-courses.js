"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // FK to the chosen cohort.
    await queryInterface.addColumn("lead_courses", "cohort_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "cohorts",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    // Snapshot of the cohort name at enroll time, so renaming/deleting a
    // cohort never corrupts historical enrollment records.
    await queryInterface.addColumn("lead_courses", "cohort_name", {
      type: Sequelize.STRING(150),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("lead_courses", "cohort_id");
    await queryInterface.removeColumn("lead_courses", "cohort_name");
  },
};
