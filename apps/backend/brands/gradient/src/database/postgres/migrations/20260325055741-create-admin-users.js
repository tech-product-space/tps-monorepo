"use strict";


export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("admin_users", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },

      roleId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: "admin_roles",
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      password: {
        type: Sequelize.STRING,
      },

      inviteStatus: {
        type: Sequelize.STRING,
      },

      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },

      lastLogin: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("admin_users");
  },
};
