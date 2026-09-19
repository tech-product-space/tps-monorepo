"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("EventCertificateTemplates", {
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
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // S3 key only, never a URL or a base64 data URL — the repo convention,
      // and it keeps a ~1MB background out of every row.
      backgroundKey: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      canvasWidth: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      canvasHeight: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // [{ key, x, y, fontSize, color, fontFamily, fontWeight, align, maxWidth }]
      // x/y are PERCENTAGES of the canvas so the admin preview and the server
      // render agree regardless of the size it is displayed at.
      fields: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },

      createdBy: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "admin_users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      updatedBy: {
        type: Sequelize.STRING,
        allowNull: true,
        references: {
          model: "admin_users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    // One template per event — the upsert in the admin API relies on this.
    await queryInterface.addConstraint("EventCertificateTemplates", {
      fields: ["eventId"],
      type: "unique",
      name: "event_certificate_templates_event_id_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("EventCertificateTemplates");
  },
};
