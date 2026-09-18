'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('CertificateTemplates', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      eventId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Events',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      certificateName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      imageSize: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      fields: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      templateImage: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('CertificateTemplates');
  }
};
