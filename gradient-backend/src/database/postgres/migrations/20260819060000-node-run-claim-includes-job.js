"use strict";

/**
 * Put the **job id** into the idempotency key, and fix a workflow engine that
 * could not get past a wait.
 *
 * The previous migration made `(enrollmentId, nodeId, attempt)` unique, on this
 * reasoning: "two jobs delivered for the same enrolment both carry
 * `attemptsMade = 0`, so both compute `attempt = 1`, and exactly one insert
 * survives."
 *
 * Every word of that is true. It is also true of something that is not a
 * duplicate at all — **a second, legitimate visit to the same node.**
 *
 * A `wait` is exactly that. It runs once and parks, writing a run row with
 * `attempt = 1`. At the deadline a *different* job arrives, also with
 * `attemptsMade = 0`, and tries to open a row for the same node with the same
 * `attempt = 1`. The unique index refuses it, `advanceEnrollment` reads the
 * violation as "another worker holds this step" and returns
 * `{ duplicate: true }`, and the enrolment never moves again.
 *
 * So every workflow containing a wait parked and stayed parked — silently, with
 * no failed job, no error row and an enrolment that still reads `active`. It
 * was found by looking at why an enrolment was still on its wait step an hour
 * after a sixty-second wait: the job had run, on time to within ten
 * milliseconds, and returned `{ duplicate: true, steps: 1 }`.
 *
 * The key was measuring the wrong thing. `attempt` counts BullMQ's retries of
 * one job, so it can only ever separate retries — never two distinct jobs. The
 * job id is what separates those, so it belongs in the key:
 *
 * - two distinct jobs at one node (park, then resume) → different `jobId`,
 *   both allowed, and the wait resumes
 * - a BullMQ retry of one job → same `jobId`, higher `attempt`, allowed,
 *   because a step that really failed must be retried
 * - the same delivery of the same job arriving twice → identical on all four
 *   columns, and exactly one insert survives, which is the duplicate this was
 *   always meant to catch
 *
 * Rows written before this migration have a null `jobId`. Postgres treats nulls
 * as distinct in a unique index, so they neither collide with each other nor
 * block anything — no backfill, and no history rewritten.
 */

const OLD_INDEX = "workflow_node_runs_enrollment_node_attempt";
const NEW_INDEX = "workflow_node_runs_enrollment_node_job_attempt";

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("workflow_node_runs", "jobId", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.removeIndex("workflow_node_runs", OLD_INDEX);

    await queryInterface.addIndex(
      "workflow_node_runs",
      ["enrollmentId", "nodeId", "jobId", "attempt"],
      { name: NEW_INDEX, unique: true },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("workflow_node_runs", NEW_INDEX);

    /**
     * Going back means re-imposing a key that cannot hold, so the duplicates
     * the old index would reject are reported rather than deleted — the same
     * decision the previous migration made, and for the same reason: those rows
     * are the record of steps that really ran.
     */
    const [duplicates] = await queryInterface.sequelize.query(
      `SELECT "enrollmentId", "nodeId", attempt, COUNT(*)::int AS count
         FROM workflow_node_runs
        GROUP BY "enrollmentId", "nodeId", attempt
       HAVING COUNT(*) > 1`,
    );

    if (duplicates.length) {
      throw new Error(
        `Cannot restore the old unique index: ${duplicates.length} ` +
          `(enrollmentId, nodeId, attempt) group(s) have more than one row. ` +
          `Most are legitimate repeat visits to a node — a wait that parked and ` +
          `resumed writes two. Inspect before deleting anything.`,
      );
    }

    await queryInterface.addIndex(
      "workflow_node_runs",
      ["enrollmentId", "nodeId", "attempt"],
      { name: OLD_INDEX, unique: true },
    );

    await queryInterface.removeColumn("workflow_node_runs", "jobId");
  },
};
