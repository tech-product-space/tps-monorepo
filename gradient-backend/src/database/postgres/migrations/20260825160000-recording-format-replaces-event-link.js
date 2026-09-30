/**
 * The event link becomes a stored `format`.
 *
 * Linking a recording to an `Events` row was only ever there to decide the
 * badge on the card — "Workshop", "Hackathon", "Teardown". It bought that at
 * the price of a foreign key, a uniqueness rule, a searchable picker in the
 * admin and a join on every public read, and it could not describe a recording
 * that never had an event behind it. The badge is now a column an admin picks
 * from the same three values the event form offers.
 *
 * **Backfilled before the link is dropped.** Two of the recordings in beta had
 * an event, and their badges are read off `eventType` today — dropping the
 * column first would blank them with no way back. `down` restores the column
 * and its unique index, but not which event each recording pointed at: that is
 * gone with the values.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Recordings", "format", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE "Recordings" r
      SET "format" = e."eventType"
      FROM "Events" e
      WHERE e.id = r."eventId"
        AND e."eventType" IS NOT NULL
    `);

    // Takes `recordings_event_id_unique` and the FK to `Events` with it —
    // Postgres drops both as dependants of the column.
    await queryInterface.removeColumn("Recordings", "eventId");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Recordings", "eventId", {
      type: Sequelize.STRING,
      allowNull: true,
      references: { model: "Events", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("Recordings", ["eventId"], {
      name: "recordings_event_id_unique",
      unique: true,
    });

    await queryInterface.removeColumn("Recordings", "format");
  },
};
