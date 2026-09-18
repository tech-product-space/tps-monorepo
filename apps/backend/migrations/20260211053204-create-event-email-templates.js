"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("EventEmailTemplates", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      eventId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Events",
          key: "id",
        },
        onDelete: "CASCADE",
      },

      templateName: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      subject: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      targetGuestType: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      targetGuestRole: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },

      scheduledAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      sentAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("EventEmailTemplates");
  },
};
