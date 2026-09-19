"use strict";

export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable("EventReminders", {
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
    },

    name: {
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

    senderEmail: {
      type: Sequelize.STRING,
      allowNull: false,
    },

    targetStatus: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    targetAttendeeType: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    scheduledAt: {
      type: Sequelize.DATE,
      allowNull: false,
    },

    status: {
      type: Sequelize.STRING,
      allowNull: false,
    },

    sentAt: {
      type: Sequelize.DATE,
      allowNull: true,
    },

    createdBy: {
      type: Sequelize.STRING,
      allowNull: true,
      references: {
        model: "admin_users",
        key: "id",
      },
    },

    updatedBy: {
      type: Sequelize.STRING,
      allowNull: true,
      references: {
        model: "admin_users",
        key: "id",
      },
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
}

export async function down(queryInterface) {
  await queryInterface.dropTable("EventReminders");
}