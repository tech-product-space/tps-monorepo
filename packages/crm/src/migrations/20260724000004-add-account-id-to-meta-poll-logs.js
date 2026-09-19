"use strict";

/** Attribute each poll-log row to the account it came from (for monitoring). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("meta_poll_logs", "account_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "meta_accounts", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("meta_poll_logs", "account_id");
  },
};
