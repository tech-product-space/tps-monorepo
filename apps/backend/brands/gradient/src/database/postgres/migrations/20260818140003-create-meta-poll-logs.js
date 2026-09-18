"use strict";

/**
 * Run history for the poll, the form sync and each backfill.
 *
 * Append-only, one row per form per run. That granularity is the point: an
 * aggregate per run would tell you leads arrived, but not that one particular
 * form stopped producing three days ago while the others kept going.
 *
 * `alreadyImported` is **not** the same as a lead with status `duplicate`.
 * This counts Facebook leads we had already seen — the expected product of the
 * poll's deliberate overlap window, and a number that should be non-zero on a
 * healthy system. A `duplicate` lead is a second submission by the same
 * person, which is a row in `meta_leads`. Using one word for both is how an
 * operator ends up unable to read their own monitoring tab.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_poll_logs", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      accountId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "meta_accounts", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },

      /** String, not an FK — a log row must survive its form being deleted. */
      formId: { type: Sequelize.STRING, allowNull: true },

      /** How many Facebook returned for the window. */
      fetchedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      /** Rows actually written to `meta_leads`. */
      newLeads: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      /** Facebook leads already in the table — the overlap window working. */
      alreadyImported: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      /** Imported, but with no email and no phone. Still real rows. */
      skipped: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      /** Threw during import. Isolated per lead, logged, never fatal. */
      failed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      /** `success` | `error` | `backfill`. */
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "success",
      },

      error: { type: Sequelize.TEXT, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // Both reads this table serves: the paginated log, and the rolling stats.
    await queryInterface.addIndex(
      "meta_poll_logs",
      [{ name: "createdAt", order: "DESC" }],
      { name: "idx_meta_poll_logs_created" },
    );
    await queryInterface.addIndex(
      "meta_poll_logs",
      [{ name: "accountId" }, { name: "createdAt", order: "DESC" }],
      { name: "idx_meta_poll_logs_account_created" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_poll_logs");
  },
};
