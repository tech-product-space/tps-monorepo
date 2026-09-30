"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("EventGuests", "referrerUserId", {
      type: Sequelize.STRING,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("EventGuests", "referrerUserId");
  },
};