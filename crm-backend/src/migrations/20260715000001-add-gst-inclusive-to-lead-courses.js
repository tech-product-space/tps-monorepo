'use strict';

/**
 * Marks whether an enrollment's course_price already includes GST.
 *
 * Defaults to false (GST added on top), which is exactly how every pre-existing
 * enrollment was charged — so existing rows keep their original numbers and
 * need no backfill.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('lead_courses', 'gst_inclusive', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('lead_courses', 'gst_inclusive');
  },
};
