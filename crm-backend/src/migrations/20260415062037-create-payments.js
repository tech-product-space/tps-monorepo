'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },

      lead_profile_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'lead_profiles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      amount: {
        type: Sequelize.INTEGER,
        allowNull: false
      },

      currency: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'INR'
      },

      description: {
        type: Sequelize.STRING
      },

      status: {
        type: Sequelize.STRING,
      },

      paid_at: {
        type: Sequelize.DATE
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    await queryInterface.addIndex('payments', ['lead_profile_id']);
    await queryInterface.addIndex('payments', ['created_by']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('payments');
  }
};