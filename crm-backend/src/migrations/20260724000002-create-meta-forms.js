"use strict";

/**
 * Cached Facebook lead forms per account. This is the optimisation: the poll
 * cron reads active forms from here instead of hitting /leadgen_forms on every
 * run. The list is refreshed only by an explicit sync (button or scheduled).
 * Each form maps to its own product + subsource (per-form routing).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_forms", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "meta_accounts", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      form_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      // Facebook form status (ACTIVE / ARCHIVED / DELETED).
      status: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      // Per-form routing. Null product → account.default_product_id is used.
      product_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      subsource_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      // Inactive forms are skipped by the poll (replaces the SKIP_FORMS list).
      active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      lead_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_seen_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("meta_forms", ["account_id", "form_id"], {
      name: "uq_meta_forms_account_form",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_forms");
  },
};
