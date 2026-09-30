'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('blogs', 'url', {
      type: Sequelize.STRING,
      defaultValue: "",
      allowNull: false,
    });

    await queryInterface.addColumn('blogs', 'recommended', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('blogs', 'url');
    await queryInterface.removeColumn('blogs', 'recommended');
  }
};
