"use strict";

/**
 * **One email per send step, per person. Enforced by the database.**
 *
 * The previous migration widened the node-run key with `jobId`, which it had to
 * — without it a wait could never resume. But widening it gave something back
 * that the narrow key had been providing by accident: two *different* jobs
 * arriving at the same send step used to collide on `(enrollmentId, nodeId,
 * attempt)` and one was dropped before it could send. With `jobId` in the key
 * they no longer collide, and both would send.
 *
 * That is not a hypothetical failure. It has already happened once in this
 * product — two identical emails, 164 ms apart, in a real inbox — and the guard
 * left standing after the key change is a read-then-act inside
 * `sendEmail.execute`: it looks for a completed run carrying a provider message
 * id and refuses to send if it finds one. Two jobs running concurrently both
 * look, both find nothing, and both send. A check that only holds when the
 * thing it guards against is not happening is not a guard.
 *
 * So the claim on a send step becomes structural. A partial unique index on
 * `(enrollmentId, nodeId)` over rows that are not `failed` means the *first*
 * job to open a run row for a send step owns it, and any second job's insert is
 * refused by Postgres before a single byte reaches SES. There is no window,
 * because there is no read.
 *
 * `status <> 'failed'` rather than `status = 'completed'`: the row is written
 * as `running` *before* the send and only becomes `completed` after it, so an
 * index over completed rows alone would leave open precisely the interval the
 * two duplicate emails were sent in. Excluding only `failed` is what lets a
 * send that genuinely failed be retried — the row leaves the index when it
 * fails, and the retry is free to claim the step again.
 *
 * The cost is a send step left `running` by a worker that died mid-send: it
 * holds the slot, and that person stops there. That is the right way round.
 * A stranded enrolment is visible — the reconcile log names it, and the
 * enrolment sits overdue in the panel — whereas a duplicate email is already in
 * somebody's inbox by the time anyone could notice.
 */

const INDEX = "workflow_node_runs_one_send_per_step";

export default {
  async up(queryInterface) {
    /**
     * Reported, never deleted — the same call the earlier index made. A second
     * completed send row *is* the record of a second email that really went
     * out, and destroying it destroys the only evidence of the bug.
     */
    const [duplicates] = await queryInterface.sequelize.query(
      `SELECT "enrollmentId", "nodeId", COUNT(*)::int AS count
         FROM workflow_node_runs
        WHERE "nodeType" = 'sendEmail' AND status <> 'failed'
        GROUP BY "enrollmentId", "nodeId"
       HAVING COUNT(*) > 1`,
    );

    if (duplicates.length) {
      throw new Error(
        `Cannot add the one-send-per-step index: ${duplicates.length} ` +
          `(enrollmentId, nodeId) pair(s) already have more than one non-failed ` +
          `send run. Each extra row is very likely a duplicate email that was ` +
          `actually delivered. Inspect them before deciding what to keep:\n` +
          duplicates
            .slice(0, 10)
            .map((d) => `  ${d.enrollmentId} / ${d.nodeId} → ${d.count} rows`)
            .join("\n"),
      );
    }

    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX "${INDEX}"
          ON workflow_node_runs ("enrollmentId", "nodeId")
       WHERE "nodeType" = 'sendEmail' AND status <> 'failed'`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${INDEX}"`);
  },
};
