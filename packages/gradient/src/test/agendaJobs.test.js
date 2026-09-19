import psEnv from "@ps/env/gradient";
/**
 * Every registered Agenda job must have a callable handler.
 *
 * This exists because of a real outage. `agenda.define` takes
 * `(name, processor, options)` — v4 moved options from second to third — and
 * `certificateIssueJob.js` still passed `(name, options, processor)`. Nothing
 * complained at boot. The queue happily accepted jobs, picked each one up, and
 * failed it instantly with "definition.fn is not a function", leaving every
 * certificate stranded on Approved with no error recorded against it. The only
 * visible symptom was an admin panel polling forever.
 *
 * A misordered define is invisible to lint, to types, and to the type of test
 * that mocks the queue. Reading the definition back after registering is the
 * cheapest thing that catches it.
 *
 * Run with: node src/test/agendaJobs.test.js
 */

// Before anything imports config/env.js. Agenda's "ready" handler calls
// `agenda.start()` when this is true, which would make this script a worker for
// the live queue and start firing unrelated jobs — including real reminder
// emails. dotenv does not overwrite a variable that is already set, so this wins.
psEnv.AGENDA_JOBS_ENABLED = "false";

const agenda = (await import("../config/agenda.js")).default;
const { initAgendaJobs } = await import("../jobs/index.js");

// The jobs this API is supposed to have. A job that stops being registered is
// as broken as one registered wrongly, and far quieter.
const EXPECTED = [
  "send-event-email-reminder",
  "activity-log-retention",
  "issue-event-certificate",
  "issue-free-course-certificate",
  "send-campaign",
];

let failures = 0;

const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }

  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
};

initAgendaJobs();

const definitions = agenda.definitions || {};

console.log("\nAgenda job definitions\n");

for (const name of EXPECTED) {
  const definition = definitions[name];

  check(`${name} is registered`, Boolean(definition));

  if (!definition) continue;

  check(
    `${name} has a callable handler`,
    typeof definition.fn === "function",
    `fn is ${typeof definition.fn} — check the argument order of agenda.define`,
  );

  // The symptom of the swap: options land in the handler slot, so the options
  // that were meant to be applied silently revert to Agenda's defaults.
  check(
    `${name} concurrency is a number`,
    typeof definition.concurrency === "number",
  );
}

const unexpected = Object.keys(definitions).filter((n) => !EXPECTED.includes(n));

if (unexpected.length) {
  console.log(
    `\n  note: also registered — ${unexpected.join(", ")}. ` +
      `Add it to EXPECTED if it is meant to be there.`,
  );
}

console.log(
  failures ? `\n${failures} check(s) failed\n` : "\nAll checks passed\n",
);

process.exit(failures ? 1 : 0);
