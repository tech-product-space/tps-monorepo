"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("VisitorNotificationHistory", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      visitorId: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      email: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      page: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("VisitorNotificationHistory", ["visitorId"], {
      name: "idx_vnh_visitorId",
    });

    await queryInterface.addIndex("VisitorNotificationHistory", ["timestamp"], {
      name: "idx_vnh_timestamp",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "VisitorNotificationHistory",
      "idx_vnh_visitorId"
    );
    await queryInterface.removeIndex(
      "VisitorNotificationHistory",
      "idx_vnh_timestamp"
    );
    await queryInterface.dropTable("VisitorNotificationHistory");
  },
};
