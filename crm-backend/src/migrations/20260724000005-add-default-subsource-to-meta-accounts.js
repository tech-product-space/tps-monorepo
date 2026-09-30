"use strict";

/**
 * Optional default subsource for an account — applied to forms that use the
 * account's default product but have no subsource mapping of their own.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("meta_accounts", "default_subsource_id", {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("meta_accounts", "default_subsource_id");
  },
};
