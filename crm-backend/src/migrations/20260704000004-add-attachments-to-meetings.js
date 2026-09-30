"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // [{ file_url, drive_file_id, title, mime_type }] — files uploaded to the
    // organizer's Drive and attached to the calendar event.
    await queryInterface.addColumn("meetings", "attachments", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("meetings", "attachments");
  },
};
