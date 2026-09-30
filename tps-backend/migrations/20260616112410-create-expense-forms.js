"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("expense_forms", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      team_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "expense_teams", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      instructions: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      require_receipt: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      require_submitter_info: {
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

    await queryInterface.addIndex("expense_forms", ["slug"]);
    await queryInterface.addIndex("expense_forms", ["team_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("expense_forms");
  },
};
