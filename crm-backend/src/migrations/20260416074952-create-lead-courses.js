"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("lead_courses", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },

      lead_profile_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "lead_profiles",
          key: "id",
        },
        onDelete: "CASCADE",
      },

      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      course_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      program_name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      course_price: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      platform_discount_percent: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      agent_discount_amount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      final_fee: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("lead_courses");
  },
};
