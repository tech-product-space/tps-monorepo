"use strict";

/**
 * Gives Cal.com bookings a Meeting row of their own.
 *
 * Cal.com bookings arrive as Lead rows (product_id "Calcom", booking data in
 * extra_fields) and had no Meeting row, so there was nowhere to hang an
 * `outcome`. That is the whole reason the Needs-outcome queue skipped them —
 * and it left Cal.com, the channel with the highest no-show rate because leads
 * book it themselves, as the one with no no-show tracking. Cal.com's webhook
 * never reports that a call happened; it only ever says Booked / Rescheduled /
 * Cancelled. It owns the booking's lifecycle, not its outcome.
 *
 * The Lead row stays exactly as it is and remains what the Dashboard and
 * CalcomLeadTable read. The webhook simply also writes a Meeting row. Same seam
 * as LeadProfile/Lead: the Lead is the person plus their current booking state,
 * the Meeting is each individual booking event.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Which system owns this row's lifecycle. Existing rows are all Google
    // Meets booked from the CRM, hence the default.
    await queryInterface.addColumn("meetings", "source", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "google",
    });
    // Cal.com's own booking identity. The schema has always stored iCalUID on
    // the Lead's additional_data but never keyed on it; the cancel/reschedule
    // handlers already look bookings up by it, so it is the upsert key here too.
    await queryInterface.addColumn("meetings", "calcom_uid", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    // Cal.com's verbatim booking status (Booked/Rescheduled/Cancelled), kept
    // beside our own `status` because they answer different questions: theirs is
    // the state of the booking, ours is whether it still stands.
    await queryInterface.addColumn("meetings", "calcom_status", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });

    // Partial UNIQUE: this is what makes the webhook upsert idempotent. Cal.com
    // retries deliveries, and a retry must update the booking rather than mint a
    // second one. Partial so the thousands of Google rows — all NULL here — are
    // exempt rather than colliding with each other.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_meetings_calcom_uid
        ON meetings (calcom_uid)
        WHERE calcom_uid IS NOT NULL
    `);

    // Both columns were written for Google-booked meetings and are meaningless
    // for a Cal.com booking: there is no Google event, and a booking nobody has
    // picked up yet has no agent (the booking cron already routes those to
    // Superadmins). Raw SQL rather than changeColumn: organizer_id carries an FK
    // to users, and changeColumn would try to redefine the constraint.
    await queryInterface.sequelize.query(
      `ALTER TABLE meetings ALTER COLUMN google_event_id DROP NOT NULL`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE meetings ALTER COLUMN organizer_id DROP NOT NULL`,
    );
  },

  /**
   * Deleting the Cal.com rows is safe precisely because of the dual write: the
   * booking still exists in full on its Lead row, so this drops a projection,
   * not data. It also has to happen before the NOT NULLs go back on — those rows
   * are the only ones holding a NULL google_event_id.
   */
  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM meetings WHERE source = 'calcom'`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE meetings ALTER COLUMN organizer_id SET NOT NULL`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE meetings ALTER COLUMN google_event_id SET NOT NULL`,
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_meetings_calcom_uid`,
    );
    await queryInterface.removeColumn("meetings", "calcom_status");
    await queryInterface.removeColumn("meetings", "calcom_uid");
    await queryInterface.removeColumn("meetings", "source");
  },
};
