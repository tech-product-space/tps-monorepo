"use strict";

/**
 * Make `(enrollmentId, nodeId, attempt)` **unique**.
 *
 * It was created as an ordinary index, and its own docblock in
 * `20260818130003-create-workflow-node-runs.js` called it "half the idempotency
 * defence" — "a redelivered job asks exactly this before it sends anything".
 * Nothing asked, and a plain index would have answered "yes, go ahead" if it
 * had, because it permits duplicates.
 *
 * The other half was a `SELECT … FOR UPDATE` in `advanceEnrollment` that
 * commits before the handler runs. Releasing a lock and *then* doing the work
 * it was meant to protect is no lock at all: the claim mutates nothing, so a
 * second job reads identical state and both proceed. Two workers sent the same
 * person the same email, which the end-to-end run demonstrated with two real
 * emails in one inbox.
 *
 * With this index the database is the arbiter. Two jobs delivered for the same
 * enrolment both carry `attemptsMade = 0`, so both compute `attempt = 1`, and
 * exactly one insert survives. A genuine BullMQ retry of the *same* job carries
 * a higher `attemptsMade` and is still allowed through — which is the point,
 * because a step that really failed must be retried.
 *
 * The narrower window — a retry after SES accepted the message but before the
 * row was written — is closed in `sendEmail.execute` instead, by refusing to
 * send when a completed run for that node already carries a provider message id.
 */

const INDEX = "workflow_node_runs_enrollment_node_attempt";

export default {
  async up(queryInterface) {
    /**
     * Any pre-existing duplicates would block the unique index, and they are
     * exactly the double-sends this is here to stop — so they are reported
     * rather than deleted. Deleting one would destroy the record of an email
     * that really was sent, which is the last thing to throw away.
     */
    const [duplicates] = await queryInterface.sequelize.query(
      `SELECT "enrollmentId", "nodeId", attempt, COUNT(*)::int AS count
         FROM workflow_node_runs
        GROUP BY "enrollmentId", "nodeId", attempt
       HAVING COUNT(*) > 1`,
    );

    if (duplicates.length) {
      throw new Error(
        `Cannot add a unique index: ${duplicates.length} (enrollmentId, nodeId, attempt) ` +
          `group(s) already have more than one row — these are duplicate step runs, ` +
          `some of which may be duplicate sends. Inspect them before deciding which to keep:\n` +
          duplicates
            .slice(0, 10)
            .map(
              (d) =>
                `  ${d.enrollmentId} / ${d.nodeId} / attempt ${d.attempt} → ${d.count} rows`,
            )
            .join("\n"),
      );
    }

    await queryInterface.removeIndex("workflow_node_runs", INDEX);

    await queryInterface.addIndex(
      "workflow_node_runs",
      ["enrollmentId", "nodeId", "attempt"],
      { name: INDEX, unique: true },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("workflow_node_runs", INDEX);

    await queryInterface.addIndex(
      "workflow_node_runs",
      ["enrollmentId", "nodeId", "attempt"],
      { name: INDEX },
    );
  },
};
