"use strict";

import { USER_LOGIN_SOURCE, USER_STATUS } from "../../../config/constants/user.js";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },

      full_name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      email: {
        type: Sequelize.STRING(150),
        allowNull: false,
        unique: true,
      },

      phone: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },

      password: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      login_source: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: USER_LOGIN_SOURCE.EMAIL,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: USER_STATUS.ACTIVE,
      },

      provider_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      profile_picture: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      email_verified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      last_login_at: {
        type: Sequelize.DATE,
        allowNull: true,
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
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("users");
  },
};
