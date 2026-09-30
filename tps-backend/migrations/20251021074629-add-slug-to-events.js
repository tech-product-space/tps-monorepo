"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add column (nullable for now to avoid breaking existing rows)
    await queryInterface.addColumn('Events', 'eventSlug', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });

    // Unique case-insensitive index
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "events_eventSlug_unique"
      ON "Events" (LOWER("eventSlug"));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "events_eventSlug_unique";`);
    await queryInterface.removeColumn('Events', 'eventSlug');
  }
};
