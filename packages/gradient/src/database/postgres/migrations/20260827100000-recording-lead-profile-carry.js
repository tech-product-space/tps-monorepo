"use strict";

/**
 * What a carried-forward lead needs to stay honest.
 *
 * The gate now requires an account, and somebody who has filled the form once
 * never fills it again for a while — opening a second recording copies their
 * details across and plays. That copy is a real `RecordingLeads` row, created
 * today, holding details typed weeks ago.
 *
 * Which breaks the obvious way of asking "how old are these details?". Reading
 * `createdAt` on the newest row would answer "created today" every time,
 * because every carry makes a new row. Somebody could watch one recording a
 * month for three years and never look stale for a single day.
 *
 * `detailsConfirmedAt` is the fix: the moment a **human** last typed or
 * confirmed the form. It is copied forward unchanged by a carry — it travels
 * with the data it describes, not with the row it happens to sit in — and is
 * reset only on a real submission.
 *
 * `source` records which of the two paths made the row. Not needed by the
 * freshness logic, but "this person filled a form for this recording" and "we
 * carried their details across when they clicked play" are very different
 * intent signals, and without the column the lead table presents them as the
 * same thing.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("RecordingLeads", "detailsConfirmedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("RecordingLeads", "source", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "form",
    });

    /**
     * Every row that exists today was typed by a person — there was no carry
     * path until this migration — so its creation date *is* its confirmation
     * date. Rows older than the window therefore get a confirm prompt on their
     * owner's next visit, which is the right outcome rather than an accident.
     *
     * Left nullable rather than backfilled-and-tightened: the freshness check
     * treats null as stale, so a row that somehow arrives without one asks for
     * a confirmation instead of silently passing as fresh.
     */
    await queryInterface.sequelize.query(
      `UPDATE "RecordingLeads" SET "detailsConfirmedAt" = "createdAt"`,
    );

    /**
     * The profile lookup — "most recent lead by this user, across every
     * recording" — runs on every gated recording page a signed-in visitor
     * opens. The existing indexes are keyed on email and on recordingId;
     * neither helps this one.
     */
    await queryInterface.addIndex("RecordingLeads", ["userId", "createdAt"], {
      name: "recording_leads_user_created_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "RecordingLeads",
      "recording_leads_user_created_at",
    );
    await queryInterface.removeColumn("RecordingLeads", "source");
    await queryInterface.removeColumn("RecordingLeads", "detailsConfirmedAt");
  },
};
