"use strict";

/**
 * One recording per event.
 *
 * The link was always meant to read as provenance — "this is the recording of
 * that session" — but nothing stopped two recordings claiming the same event.
 * That matters because `format` is derived from the event: two recordings of one
 * event is also two recordings whose format is decided somewhere neither of them
 * owns, and the event page has no way to choose which recording to point at.
 *
 * A unique index rather than application-only checks, so the guarantee survives
 * a concurrent double-save. Postgres treats NULLs as distinct, so any number of
 * unlinked recordings still coexist — which is why the plain non-unique index
 * this replaces is redundant: a unique index serves lookups just as well.
 */
export default {
  async up(queryInterface) {
    await queryInterface.removeIndex("Recordings", "recordings_event_id");

    await queryInterface.addIndex("Recordings", ["eventId"], {
      name: "recordings_event_id_unique",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("Recordings", "recordings_event_id_unique");

    await queryInterface.addIndex("Recordings", ["eventId"], {
      name: "recordings_event_id",
    });
  },
};
