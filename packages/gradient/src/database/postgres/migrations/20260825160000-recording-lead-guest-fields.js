"use strict";

/**
 * Brings `RecordingLeads` up to the field set the event join form collects.
 *
 * The recording gate asked for an email and nothing else, so five of the
 * columns already on this table were never populated and the manage screen had
 * to stop rendering them. The gate now uses `EventDetailsForm` — the same
 * component, and therefore the same validation, as `POST /events/guest/join` —
 * so those columns start carrying data and these four close the gap.
 *
 * Mapped against `EventGuests`, which is the shape being matched:
 *
 *   already here   name, email, phone, countryCode, additionalData, userId
 *   added here     attendeeType, collegeName, graduationYear, linkedinUrl
 *   mapped         role → the existing `jobTitle` column
 *   deliberately not here   referralCode
 *
 * **`role` maps onto `jobTitle` rather than getting a column of its own.** They
 * are the same fact under two names, and the form's own label is "Current role
 * / company" — which is a job title. A second column would mean two places to
 * read a person's role from and a rule about which wins.
 *
 * **`referralCode` is left out.** It exists on `EventGuests` because there is a
 * referral programme behind it — `referrerUserId`, a leaderboard, bulk approval
 * by referral count, all of it event-scoped. None of that exists for
 * recordings, so the column would take input that nothing credits and nothing
 * reads. `EventDetailsForm` already defaults `showReferralCode` to false, so
 * the field simply does not render on this surface; add both together if a
 * recording referral programme is ever wanted.
 *
 * Every column is nullable. Existing rows pre-date the fuller form and have
 * only an address — backfilling them is not possible and pretending otherwise
 * with a default would be worse than a null that says "never asked".
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("RecordingLeads", "attendeeType", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("RecordingLeads", "collegeName", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // A string, matching `EventGuests`. The form validates it as four digits in
    // a sane range; storing it as an integer here would gain nothing and would
    // disagree with the column it is meant to mirror.
    await queryInterface.addColumn("RecordingLeads", "graduationYear", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("RecordingLeads", "linkedinUrl", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("RecordingLeads", "attendeeType");
    await queryInterface.removeColumn("RecordingLeads", "collegeName");
    await queryInterface.removeColumn("RecordingLeads", "graduationYear");
    await queryInterface.removeColumn("RecordingLeads", "linkedinUrl");
  },
};
