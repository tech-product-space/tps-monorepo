"use strict";

/**
 * Drops `Recordings.format`.
 *
 * It duplicated `Events.eventType`. Once the link became one-to-one and the
 * format was derived from it, the column was a cache of a value one join away
 * — free to drift if anything ever wrote it directly, and a field the admin
 * panel had to render read-only to stop anyone editing something the API would
 * overwrite. The badge now reads `recording.event?.eventType`.
 *
 * Standalone recordings lose their badge, which is the point: "Masterclass"
 * had no event type behind it, so it was a label with nothing to keep it
 * honest.
 *
 * `down` restores the column but not the data. Recomputing it from the linked
 * event is exactly what the association now does, and the rows that had a
 * format with no event — the Masterclasses — are unrecoverable either way.
 */
export default {
  async up(queryInterface) {
    await queryInterface.removeColumn("Recordings", "format");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Recordings", "format", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
};
