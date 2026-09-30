'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('blogs', 'metaTitle', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: '',
    });

    await queryInterface.addColumn('blogs', 'metaDesc', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: '',
    });

    await queryInterface.addColumn('blogs', 'readTime', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0,
    });

    await queryInterface.addColumn('blogs', 'thumbnailSrc', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: '',
    });

    await queryInterface.addColumn('blogs', 'thumbnailAlt', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: '',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('blogs', 'metaTitle');
    await queryInterface.removeColumn('blogs', 'metaDesc');
    await queryInterface.removeColumn('blogs', 'readTime');
    await queryInterface.removeColumn('blogs', 'thumbnailSrc');
    await queryInterface.removeColumn('blogs', 'thumbnailAlt');
  }
};
