'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leads', 'subsource_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
      references: {
        model: 'subsources',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('leads', 'subsource_id');
  }
};
