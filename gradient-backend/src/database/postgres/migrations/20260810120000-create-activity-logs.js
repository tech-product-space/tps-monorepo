"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("activity_logs", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      actorType: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "admin",
      },

      // Deliberately not a foreign key — the row must outlive the admin.
      actorId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      actorName: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      actorEmail: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      actorRole: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      action: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      entityType: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      entityId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      entityLabel: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      summary: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      changes: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      method: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      path: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      routeKey: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      statusCode: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "success",
      },

      ipAddress: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      userAgent: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      // Append-only: there is no updatedAt.
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.addIndex("activity_logs", ["createdAt"], {
      name: "activity_logs_created_at_idx",
    });

    await queryInterface.addIndex("activity_logs", ["actorId", "createdAt"], {
      name: "activity_logs_actor_idx",
    });

    await queryInterface.addIndex(
      "activity_logs",
      ["entityType", "entityId", "createdAt"],
      { name: "activity_logs_entity_idx" },
    );

    await queryInterface.addIndex("activity_logs", ["action", "createdAt"], {
      name: "activity_logs_action_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("activity_logs");
  },
};
