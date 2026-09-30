'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    await queryInterface.addColumn('payments', 'lead_course_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'lead_courses',
        key: 'id'
      },
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('payments', 'expire_by', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });

  },

  async down(queryInterface) {

    await queryInterface.removeColumn('payments', 'lead_course_id');

    await queryInterface.removeColumn('payments', 'expire_by');

  }
};