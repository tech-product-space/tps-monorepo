'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('blogs', {
      blog_id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      author: {
        type: Sequelize.STRING,
        allowNull: true
      },
      publishedDate: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      category: {
        type: Sequelize.STRING,
        allowNull: false
      },
      content: {
        type: Sequelize.JSON,  // Stores blog content (text, images, etc.)
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('blogs'); // Drop table if rollback
  }
};
