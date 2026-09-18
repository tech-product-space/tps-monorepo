"use strict";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("contact_lists", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      /**
       * What this list is and where it came from. A list called "webinar" is
       * unusable six months later, and the person who uploaded it is rarely the
       * person choosing an audience.
       */
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      createdBy: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("contact_lists");
  },
};
