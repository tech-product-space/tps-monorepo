'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('EventGuests');


    if (!table.certificateGenerated) {
      await queryInterface.addColumn('EventGuests', 'certificateGenerated', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!table.certificateId) {
      await queryInterface.addColumn('EventGuests', 'certificateId', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!table.certificateGeneratedAt) {
      await queryInterface.addColumn('EventGuests', 'certificateGeneratedAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('EventGuests', 'certificateGenerated');
    await queryInterface.removeColumn('EventGuests', 'certificateId');
    await queryInterface.removeColumn('EventGuests', 'certificateGeneratedAt');
  }
};
