"use strict";

/**
 * Library email templates, plus the two campaign columns that record a body
 * built from one. See ../../EMAIL_TEMPLATES_PLAN.md §4.
 *
 * `campaigns.content_mode` defaults to 'editor', which is what every existing
 * row already is — no backfill.
 *
 * Tables are addressed with an explicit schema. `createTable` resolves an
 * unqualified name through search_path (→ tps), but `addColumn` here was sent
 * to `public.campaigns` and failed, so nothing is left to that difference.
 * One transaction, so a failure leaves nothing half-applied.
 */
const SCHEMA = process.env.DB_SCHEMA || "tps";

const templates = { tableName: "email_library_templates", schema: SCHEMA };
const campaigns = { tableName: "campaigns", schema: SCHEMA };

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        templates,
        {
          id: {
            type: Sequelize.STRING,
            primaryKey: true,
            allowNull: false,
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          html: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          fields: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: [],
          },
          size_bytes: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          is_archived: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          created_by: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          updated_by: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction },
      );

      await queryInterface.addIndex(templates, ["is_archived"], { transaction });

      await queryInterface.addColumn(
        campaigns,
        "content_mode",
        {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "editor",
        },
        { transaction },
      );

      await queryInterface.addColumn(
        campaigns,
        "template_id",
        {
          type: Sequelize.STRING,
          allowNull: true,
        },
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn(campaigns, "template_id", { transaction });
      await queryInterface.removeColumn(campaigns, "content_mode", { transaction });
      await queryInterface.dropTable(templates, { transaction });
    });
  },
};
