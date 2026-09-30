"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("email_sender_usage", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      sender_email: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },

      sent_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addConstraint("email_sender_usage", {
      fields: ["sender_email", "date"],
      type: "unique",
      name: "unique_sender_date",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("email_sender_usage");
  },
};
