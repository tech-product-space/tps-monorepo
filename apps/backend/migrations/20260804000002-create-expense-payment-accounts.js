"use strict";

const { ulid } = require("ulid");

// Promotes `payment_account` from a free-text column to a managed list, mirroring
// expense_teams: admins add/rename/archive accounts on their own tab, and both
// expenses and recurring templates reference one by id.
//
// Any free-text values written before this migration are lifted into the new
// table (deduped case-insensitively) and re-pointed, so nothing is lost.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { sequelize } = queryInterface;

    await queryInterface.createTable("expense_payment_accounts", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "company", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Lift existing free-text values into the table, first spelling wins.
    const existing = await sequelize.query(
      `SELECT DISTINCT payment_account FROM (
         SELECT payment_account FROM expenses WHERE payment_account IS NOT NULL
         UNION ALL
         SELECT payment_account FROM recurring_expenses WHERE payment_account IS NOT NULL
       ) t`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const byLower = new Map();
    for (const r of existing) {
      const name = (r.payment_account || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!byLower.has(key)) byLower.set(key, { id: ulid(), name });
    }

    if (byLower.size) {
      const now = new Date();
      await queryInterface.bulkInsert(
        "expense_payment_accounts",
        [...byLower.values()].map((a) => ({
          id: a.id,
          name: a.name,
          is_active: true,
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    for (const table of ["expenses", "recurring_expenses"]) {
      await queryInterface.addColumn(table, "payment_account_id", {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "expense_payment_accounts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });

      // Re-point rows at their new account (case-insensitive name match).
      for (const account of byLower.values()) {
        await sequelize.query(
          `UPDATE ${table} SET payment_account_id = :id
           WHERE LOWER(TRIM(payment_account)) = :name`,
          { replacements: { id: account.id, name: account.name.toLowerCase() } }
        );
      }

      await queryInterface.removeColumn(table, "payment_account");
    }

    await queryInterface.addIndex("expenses", ["payment_account_id"]);
  },

  async down(queryInterface, Sequelize) {
    const { sequelize } = queryInterface;

    await queryInterface.removeIndex("expenses", ["payment_account_id"]);

    for (const table of ["expenses", "recurring_expenses"]) {
      await queryInterface.addColumn(table, "payment_account", {
        type: Sequelize.STRING,
        allowNull: true,
      });
      // Flatten the FK back to the account's name before dropping it.
      await sequelize.query(
        `UPDATE ${table} t SET payment_account = a.name
         FROM expense_payment_accounts a
         WHERE t.payment_account_id = a.id`
      );
      await queryInterface.removeColumn(table, "payment_account_id");
    }

    await queryInterface.dropTable("expense_payment_accounts");
  },
};
