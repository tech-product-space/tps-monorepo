"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ResourceLeads", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      resourceId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "Resources",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      jobTitle: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      additionalData: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
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

    await queryInterface.addIndex("ResourceLeads", ["resourceId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ResourceLeads");
  },
};
