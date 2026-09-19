"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("EventGuests", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      eventId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "Events",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },

      userId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      attendeeType: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      role: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      collegeName: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      graduationYear: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      referralCode: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      linkedinUrl: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      statusUpdatedBy: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "admin_users", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },

      statusUpdatedAt: {
        type: Sequelize.DATE,
        allowNull: true,
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
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("EventGuests");
  },
};
