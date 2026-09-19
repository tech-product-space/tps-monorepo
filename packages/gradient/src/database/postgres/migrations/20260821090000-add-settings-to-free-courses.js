"use strict";

/**
 * Per-course switches for the certificate flow, mirroring `Events.settings`.
 *
 * JSONB with a `{}` default rather than a boolean column per switch: adding the
 * next one is then a constant in `FREE_COURSE_SETTINGS_DEFAULTS`, not a
 * migration. The catch — and the reason `resolveFreeCourseSettings()` is the
 * only supported way to read this — is that every existing row stores `{}`, so
 * a direct read of a default-on key yields undefined and behaves as off.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("FreeCourses", "settings", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("FreeCourses", "settings");
  },
};
