"use strict";

/**
 * What a library template is for — 'event', or null for a general one.
 * An event template can be filled from an event's own details when it is
 * used in a campaign (see services/emailTemplate/eventTemplateValues.js).
 *
 * Schema-qualified and transactional for the same reason as the migration
 * that created the table.
 */
const SCHEMA = process.env.DB_SCHEMA || "tps";
const templates = { tableName: "email_library_templates", schema: SCHEMA };

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        templates,
        "type",
        { type: Sequelize.STRING, allowNull: true },
        { transaction },
      );
      await queryInterface.addIndex(templates, ["type"], { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn(templates, "type", { transaction });
    });
  },
};
