"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("lead_consent", {
      lead_source_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      lead_source_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      opt_out_email: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      opt_out_whatsapp: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      opt_out_email_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      opt_out_whatsapp_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      opt_out_email_reason: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      opt_out_whatsapp_reason: {
        type: Sequelize.STRING,
        allowNull: true,
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

    await queryInterface.addConstraint("lead_consent", {
      fields: ["lead_source_type", "lead_source_id"],
      type: "primary key",
      name: "lead_consent_pkey",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("lead_consent");
  },
};
