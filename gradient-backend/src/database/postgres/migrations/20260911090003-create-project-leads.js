"use strict";

/**
 * Somebody who passed a project's download gate.
 *
 * Unique on (projectId, email), following RecordingLeads rather than
 * ResourceLeads. The gate is a client-side unlock, so it reappears for the same
 * person on a new device or with cleared storage — unconditional inserts would
 * make the download count mostly repeat visitors. A repeat bumps
 * submissionCount and returns 200; it is not a 409.
 *
 * `userId` is SET NULL rather than CASCADE: deleting an account must not delete
 * the record that a download happened. The row keeps its email either way.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ProjectLeads", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      projectId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "Projects", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      userId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // Stored lowercased — the key every audience in this system uses.
      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      countryCode: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      source: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "form",
      },

      submissionCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      lastSubmittedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      // Freshness is measured on this, never on createdAt — a carried row is
      // created today out of details typed months ago.
      detailsConfirmedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      additionalData: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("ProjectLeads", ["projectId", "email"], {
      unique: true,
      name: "project_leads_project_email_unique",
    });

    // The carry-forward lookup, and the campaign audience resolver.
    await queryInterface.addIndex("ProjectLeads", ["email"], {
      name: "project_leads_email",
    });

    await queryInterface.addIndex("ProjectLeads", ["userId"], {
      name: "project_leads_user_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ProjectLeads");
  },
};
