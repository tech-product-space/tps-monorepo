'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('blogs', 'type', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'draft',
    });

    await queryInterface.addColumn('blogs', 'featured', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('blogs', 'type');
    await queryInterface.removeColumn('blogs', 'featured');
  }
};
