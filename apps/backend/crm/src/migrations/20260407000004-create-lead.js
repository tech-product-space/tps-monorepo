"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("leads", {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
      },
      city: {
        type: Sequelize.STRING(100),
      },
      state: {
        type: Sequelize.STRING(100),
      },
      
      country_code: {
        type: Sequelize.STRING(10),
        defaultValue: "+91",
      },

      product_id: {
        type: Sequelize.STRING(50),
        references: {
          model: "products",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      utm_source: {
        type: Sequelize.STRING(100),
      },
      utm_medium: {
        type: Sequelize.STRING(100),
      },
      utm_campaign: {
        type: Sequelize.STRING(200),
      },

      extra_fields: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      additional_data: {
        type: Sequelize.JSONB,
        allowNull: true,
      },

      status_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        references: {
          model: "statuses",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      agent_id: {
        type: Sequelize.UUID,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      next_followup: {
        type: Sequelize.DATE,
      },
      loss_reason: {
        type: Sequelize.STRING(500),
      },
      last_re_entry: {
        type: Sequelize.DATE,
      },
      is_re_entry_priority: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      product_history: {
        type: Sequelize.ARRAY(Sequelize.STRING),
      },
      intent: {
        type: Sequelize.STRING(10),
        defaultValue: "Low",
      },
      is_deleted: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      lead_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
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

    await queryInterface.addIndex("leads", ["phone"]);
    await queryInterface.addIndex("leads", ["agent_id"]);
    await queryInterface.addIndex("leads", ["status_id"]);
    await queryInterface.addIndex("leads", ["product_id"]);
    await queryInterface.addIndex("leads", ["lead_date"]);
    await queryInterface.addIndex("leads", ["next_followup"]);
    await queryInterface.addIndex("leads", ["is_deleted"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("leads");
  },
};
