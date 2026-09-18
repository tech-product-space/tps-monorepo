"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await Promise.all([
      queryInterface.changeColumn("user_profiles", "name", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "email", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "mobile", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "query", {
        type: Sequelize.TEXT,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "company", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "current_role", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "linkedin", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "target_domain", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "question_type", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "date", {
        type: Sequelize.DATEONLY,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "time", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "referral_code", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "best_describe_you", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "best_describe_your_role", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "designation", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "gender", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
      queryInterface.changeColumn("user_profiles", "resume", {
        type: Sequelize.STRING,
        allowNull: true,
      }),
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    // You can reverse the above if needed by setting allowNull: false again
  }
};
