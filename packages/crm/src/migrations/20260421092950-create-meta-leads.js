"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_leads", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },

      meta_lead_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },

      form_id: {
        type: Sequelize.STRING(100),
      },

      ad_id: {
        type: Sequelize.STRING(100),
      },

      adset_id: {
        type: Sequelize.STRING(100),
      },

      campaign_id: {
        type: Sequelize.STRING(100),
      },

      page_id: {
        type: Sequelize.STRING(100),
      },

      lead_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },

      raw_payload: {
        type: Sequelize.JSONB,
      },

      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },

      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex("meta_leads", ["meta_lead_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_leads");
  },
};