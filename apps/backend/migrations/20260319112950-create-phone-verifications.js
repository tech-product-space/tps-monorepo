"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("phone_verifications", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      country_code: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      verified_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("phone_verifications");
  },
};
