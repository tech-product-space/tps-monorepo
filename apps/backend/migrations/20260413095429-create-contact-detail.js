'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ContactDetails', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
        primaryKey: true,
      },

      contactListId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'ContactLists',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      email: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    // ✅ uniqueness constraint (critical)
    await queryInterface.addConstraint('ContactDetails', {
      fields: ['contactListId', 'email', 'phone'],
      type: 'unique',
      name: 'unique_contact_per_list',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ContactDetails');
  },
};