"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("targets", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      target_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      scope_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      scope_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      period_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      period_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      period_end: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      value: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      notes: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("targets", ["scope_type", "scope_id"], {
      name: "idx_targets_scope",
    });
    await queryInterface.addIndex("targets", ["period_start", "period_end"], {
      name: "idx_targets_period",
    });
    await queryInterface.addIndex("targets", ["is_active"], {
      name: "idx_targets_is_active",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("targets");
  },
};
