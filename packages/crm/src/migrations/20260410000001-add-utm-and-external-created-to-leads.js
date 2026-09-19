'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leads', 'utm_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('leads', 'utm_content', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leads', 'utm_id');
    await queryInterface.removeColumn('leads', 'utm_content');
  },
};
