"use strict";

/**
 * Drops `Recordings.emailTemplate`.
 *
 * The recording gate returns the video in its own response and the player
 * starts on it immediately, so the "watch link" email arrived after the person
 * was already watching — a second copy of a link they were holding, not a
 * delivery mechanism. It was the only thing this column fed, and the only thing
 * the manage screen's Email tab existed to edit.
 *
 * Removed rather than switched off. A `sendWatchLinkEmail: false` default plus
 * a hidden editor is a mailer sitting one toggle away from somebody who does
 * not know why it was off; a dropped column cannot be turned back on by
 * accident.
 *
 * Safe to run: no recording had a subject or a body when this was written, so
 * `down` restoring an empty column loses nothing. Should a recording email be
 * wanted later, it belongs with the campaign tooling that already exists for
 * one-to-many sends, not as a JSONB blob on the content row.
 */
export default {
  async up(queryInterface) {
    await queryInterface.removeColumn("Recordings", "emailTemplate");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Recordings", "emailTemplate", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: {},
    });
  },
};
