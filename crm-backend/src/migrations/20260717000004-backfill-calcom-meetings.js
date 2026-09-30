"use strict";

const { randomUUID } = require("crypto");

/**
 * Projects the Cal.com bookings that already exist as Lead rows onto Meeting
 * rows, so history doesn't start at the moment 20260717000003 shipped.
 *
 * NO OUTCOMES ARE INVENTED. Every projected booking arrives with outcome NULL,
 * exactly as if it had just ended: if it's in the past it goes into the queue
 * and waits for a human. An earlier draft settled anything older than a week as
 * 'attended' to keep the queue small; that was rejected, on the grounds that a
 * verdict nobody gave shouldn't be written at all. The companion Google backfill
 * (20260717000002) was dropped for the same reason.
 *
 * The tradeoff is accepted deliberately: the queue opens holding the whole
 * back-catalogue of Cal.com bookings. Reps clear or ignore them, but nothing in
 * the database claims something that didn't happen.
 *
 * created_at is carried across from the Lead, NOT defaulted to now. It is the
 * day the booking was made, and inventing today's date would be a lie that the
 * report's date arithmetic would faithfully propagate.
 *
 * Done in JS rather than one INSERT…SELECT because extra_fields is JSONB written
 * by a webhook: startTime is a string of unverified shape, and a single bad row
 * would abort a set-based cast for every other row too. Volume is small — these
 * are mentor calls, not events.
 */

module.exports = {
  async up(queryInterface) {
    const leads = await queryInterface.sequelize.query(
      `
      SELECT l.id, l.profile_id, l.agent_id, l.created_at,
             l.extra_fields, l.additional_data,
             p.name AS profile_name, p.email AS profile_email
        FROM leads l
        JOIN lead_profiles p ON p.id = l.profile_id
       WHERE l.product_id = 'Calcom'
         AND l.is_deleted = false
      `,
      { type: queryInterface.sequelize.QueryTypes.SELECT },
    );

    const now = Date.now();
    const rows = [];
    let skipped = 0;

    for (const l of leads) {
      const ef = l.extra_fields || {};
      const ad = l.additional_data || {};
      const start = ef.startTime ? new Date(ef.startTime) : null;
      const end = ef.endTime ? new Date(ef.endTime) : null;
      // No usable window means no meeting: the row could never be bucketed, and
      // a Meeting with a null start_time would break every list query.
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        skipped++;
        continue;
      }

      const cancelled = String(ef.status || "").toLowerCase() === "cancelled";

      rows.push({
        id: randomUUID(),
        lead_id: l.id,
        profile_id: l.profile_id,
        organizer_id: l.agent_id || null,
        source: "calcom",
        calcom_uid: ad.iCalUID || null,
        calcom_status: ef.status || null,
        google_event_id: null,
        calendar_id: "primary",
        meet_link: ef.meetingUrl || null,
        title: ef.eventTitle || "Cal.com booking",
        description: ef.notes || null,
        start_time: start,
        end_time: end,
        timezone: "Asia/Kolkata",
        // A booking the lead cancelled through Cal.com is settled on arrival —
        // Cal.com owns that fact and it needs no verdict. Everything else waits
        // for a human, however old it is.
        status: cancelled ? "cancelled" : "scheduled",
        status_synced: false,
        outcome: null,
        outcome_at: null,
        outcome_by: null,
        outcome_note_id: null,
        next_meeting_id: null,
        attendees: JSON.stringify([
          {
            email: l.profile_email || null,
            name: l.profile_name || null,
            user_id: null,
            type: "lead",
          },
        ]),
        attachments: JSON.stringify([]),
        created_at: l.created_at,
        updated_at: new Date(),
      });
    }

    // Skip any booking the webhook has already mirrored. Only iCalUID-keyed rows
    // can be recognised; a booking that never carried one is inserted unkeyed and
    // simply can't be reconciled later — which is why the check tolerates nulls
    // on both sides rather than assuming they match.
    const existing = await queryInterface.sequelize.query(
      `SELECT calcom_uid FROM meetings WHERE source = 'calcom' AND calcom_uid IS NOT NULL`,
      { type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    const seen = new Set(existing.map((r) => r.calcom_uid));
    const fresh = rows.filter((r) => !r.calcom_uid || !seen.has(r.calcom_uid));

    // Two bookings sharing an iCalUID would trip the partial unique index and
    // abort the whole insert. Keep the first and report the rest.
    const batch = [];
    const batchKeys = new Set();
    let duplicates = 0;
    for (const r of fresh) {
      if (r.calcom_uid) {
        if (batchKeys.has(r.calcom_uid)) {
          duplicates++;
          continue;
        }
        batchKeys.add(r.calcom_uid);
      }
      batch.push(r);
    }

    if (batch.length) {
      await queryInterface.bulkInsert("meetings", batch);
    }

    const queued = batch.filter(
      (r) => r.status === "scheduled" && r.end_time.getTime() < now,
    ).length;
    const cancelled = batch.filter((r) => r.status === "cancelled").length;
    console.log(
      `[backfill-calcom-meetings] ${leads.length} Cal.com leads → ${batch.length} meetings ` +
        `(${queued} entering the outcome queue, ${cancelled} cancelled, ` +
        `${batch.length - queued - cancelled} still upcoming; ` +
        `${skipped} skipped for no usable start/end, ${duplicates} duplicate iCalUID, ` +
        `${rows.length - fresh.length} already mirrored)`,
    );
  },

  /**
   * Removes Cal.com meetings that carry no human verdict.
   *
   * Being straight about the limitation: a row this migration inserted and a row
   * the webhook mirrored afterwards are genuinely indistinguishable — both start
   * with outcome_by NULL, and there is no marker separating them. So this takes
   * both, which is wider than a strict inverse of up().
   *
   * That is acceptable only because of the dual write: every one of these
   * bookings still exists in full on its Lead row. This drops a projection, not
   * data, and re-running up() rebuilds it. What it must never drop is a verdict a
   * human actually gave — hence the outcome_by / outcome_note_id guards.
   */
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM meetings
       WHERE source = 'calcom'
         AND outcome_by IS NULL
         AND outcome_note_id IS NULL
    `);
  },
};
