"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("workflow_settings", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        defaultValue: 1,
      },

      maxActiveWorkflowsPerPerson: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      updatedBy: { type: Sequelize.STRING, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    /**
     * Exactly one row, enforced rather than assumed.
     *
     * A second row would mean two answers to "how many workflows may this
     * person be in at once", and whichever one the cache happened to read
     * would win. The same class of bug as a second suppression table.
     */
    await queryInterface.sequelize.query(
      `ALTER TABLE workflow_settings
         ADD CONSTRAINT workflow_settings_single_row CHECK (id = 1)`,
    );

    // Seed it, so nothing has to cope with the table being empty. The cap is
    // the feature's main safety rail and it must hold from the first enrolment,
    // not from the first time somebody opens the settings page.
    await queryInterface.bulkInsert("workflow_settings", [
      {
        id: 1,
        maxActiveWorkflowsPerPerson: 1,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("workflow_settings");
  },
};
