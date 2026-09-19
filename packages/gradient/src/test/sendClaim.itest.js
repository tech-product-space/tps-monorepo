/**
 * The send claim, hammered directly.
 *
 * Proves the property the end-to-end suite can only prove when it has a real
 * inbox to send to and an address that is not already enrolled somewhere else:
 * **two jobs cannot both open a run row for the same send step.** It asserts on
 * the database, so it needs no worker, no queue and no email.
 *
 * The three checks map to the three ways this has to behave:
 *   1. concurrent claims on one send step — exactly one wins
 *   2. a failed send releases the step, so a retry can happen
 *   3. a wait is *not* covered by it, because a wait legitimately runs twice
 */

import "dotenv/config";

import db from "../database/postgres/models/index.js";
import { WORKFLOW_NODE_RUN_STATUS } from "../config/constants/workflow.js";

const { Workflow, WorkflowEnrollment, WorkflowNodeRun } = db;

const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok });
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

/**
 * Real rows, because `enrollmentId` carries a foreign key. A fabricated id is
 * refused by the constraint before the index this test is about ever gets a
 * look at it.
 */
const STAMP = Date.now().toString(36);

const workflow = await Workflow.create({
  name: `claim-test ${STAMP}`,
  status: "draft",
  definition: { nodes: [], edges: [], entryNodeId: null },
  triggerConfig: {},
  settings: {},
});

const enrollment = await WorkflowEnrollment.create({
  workflowId: workflow.id,
  workflowVersion: 1,
  email: `claim-${STAMP}@example.invalid`,
  enrollmentSource: "manual",
  status: "active",
  currentNodeId: "send",
  enrolledAt: new Date(),
});

const ENR = enrollment.id;

const open = (nodeId, nodeType, jobId, extra = {}) =>
  WorkflowNodeRun.create({
    enrollmentId: ENR,
    nodeId,
    nodeType,
    jobId,
    attempt: 1,
    status: WORKFLOW_NODE_RUN_STATUS.RUNNING,
    startedAt: new Date(),
    ...extra,
  });

const settle = (r) => r.status === "fulfilled";
const unique = (r) =>
  r.status === "rejected" && r.reason?.name === "SequelizeUniqueConstraintError";

console.log("\n── the send claim ──");

/* 1. ten jobs race for one send step */
const raced = await Promise.allSettled(
  Array.from({ length: 10 }, (_, i) => open("send", "sendEmail", `job-${i}`)),
);

check(
  "exactly one of ten concurrent claims wins",
  raced.filter(settle).length === 1,
  `${raced.filter(settle).length} won, ${raced.filter(unique).length} refused`,
);
check(
  "every loser was refused by the unique index, not by something else",
  raced.filter((r) => r.status === "rejected").every(unique),
  raced
    .filter((r) => r.status === "rejected" && !unique(r))
    .map((r) => r.reason?.name)
    .join(", ") || "all unique-constraint",
);

/* 2. a failed send releases the step */
const winner = raced.find(settle).value;
await winner.update({ status: WORKFLOW_NODE_RUN_STATUS.FAILED, finishedAt: new Date() });

let retried = null;
try {
  retried = await open("send", "sendEmail", "job-retry");
} catch (error) {
  check("a failed send can be retried", false, error.name);
}
if (retried) check("a failed send can be retried", true, "claimed again");

/* and once it completes, nothing else may claim it */
await retried.update({
  status: WORKFLOW_NODE_RUN_STATUS.COMPLETED,
  providerMessageId: "msg-1",
  finishedAt: new Date(),
});

let afterComplete = null;
try {
  afterComplete = await open("send", "sendEmail", "job-late");
} catch (error) {
  check("a completed send can never be claimed again", unique({ status: "rejected", reason: error }), error.name);
}
if (afterComplete) check("a completed send can never be claimed again", false, "a second row was created");

/* 3. a wait may legitimately run twice — park, then resume */
const parkRun = await open("pause", "wait", "job-park");
await parkRun.update({ status: WORKFLOW_NODE_RUN_STATUS.COMPLETED, finishedAt: new Date() });

let resumeRun = null;
try {
  resumeRun = await open("pause", "wait", "job-resume");
} catch (error) {
  check("a wait can park and then resume", false, `${error.name} — the bug is back`);
}
if (resumeRun) check("a wait can park and then resume", true, "two runs, two jobs");

/* and the same job delivered twice is still refused */
let redelivered = null;
try {
  redelivered = await open("pause", "wait", "job-resume");
} catch (error) {
  check("the same job delivered twice is still refused", unique({ status: "rejected", reason: error }), error.name);
}
if (redelivered) check("the same job delivered twice is still refused", false, "a duplicate row was created");

await WorkflowNodeRun.destroy({ where: { enrollmentId: ENR } });
await WorkflowEnrollment.destroy({ where: { id: ENR } });
await Workflow.destroy({ where: { id: workflow.id } });
console.log("   (cleaned up)");

const failed = results.filter((r) => !r.ok);
console.log(
  `\n  ${results.length - failed.length} passed, ${failed.length} failed\n`,
);
process.exit(failed.length ? 1 : 0);
