"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("expenses", "source", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "internal",
    });
    await queryInterface.addColumn("expenses", "expense_form_id", {
      type: Sequelize.STRING,
      allowNull: true,
      references: { model: "expense_forms", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("expenses", "team_id", {
      type: Sequelize.STRING,
      allowNull: true,
      references: { model: "expense_teams", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("expenses", "submitter_name", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("expenses", "submitter_email", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("expenses", "submitter_phone", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addIndex("expenses", ["source"]);
    await queryInterface.addIndex("expenses", ["team_id"]);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("expenses", "source");
    await queryInterface.removeColumn("expenses", "expense_form_id");
    await queryInterface.removeColumn("expenses", "team_id");
    await queryInterface.removeColumn("expenses", "submitter_name");
    await queryInterface.removeColumn("expenses", "submitter_email");
    await queryInterface.removeColumn("expenses", "submitter_phone");
  },
};
