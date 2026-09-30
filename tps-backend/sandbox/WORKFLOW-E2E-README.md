# Workflow Engine — End-to-End Tests

Phase 2 has two test entry points in this folder.

## Prerequisites

Both tests require:

1. **Postgres** — your `.env` already points at it; migrations are applied
2. **Redis** — running via Docker:
   `docker run -d --name workflow-redis -p 6379:6379 redis:7-alpine`
3. **Worker process** — start in its own terminal:
   `node workers/workflowWorker.js`

`e2e-http-smoke.js` additionally needs the **API server**:
`node server.js`

## What to run

### `e2e-workflow.js` — engine-level test (recommended)

Drives the engine via internal services (no HTTP needed). Exercises:

| # | Scenario | ~Duration |
|---|---|---|
| 1 | Happy path — single `goal` node, 3 enrollments | ~5s |
| 2 | Publish validation — bad DAG rejected with errors | ~1s |
| 3 | Cancel mid-flight — cancelled enrollment doesn't advance | ~40s |
| 4 | Pause / resume — paused workflow halts in-flight, resume continues | ~30s |
| 5 | Opt-out cascade — recording opt-out cancels matching enrollments | ~3s |

```bash
node sandbox/e2e-workflow.js
```

Set `E2E_FAST=1` to skip the pause/resume test (cuts ~30s off the run).

Test data uses fake lead IDs prefixed `e2e-fake-` and cleans itself up at
the end — does NOT touch `platform_leads`, `external_leads`, or any real
data.

### `e2e-http-smoke.js` — API surface test

Hits each `/api/v1/workflows/*`, `/api/v1/enrollments/*`,
`/api/v1/leads/opt-out` endpoint via fetch. Confirms routes are wired and
the controller layer behaves on:

- create / update / get / validate / publish / pause / resume / archive
- bad-DAG validate (returns errors list)
- editing an active workflow (returns 409)

```bash
node sandbox/e2e-http-smoke.js
```

Override the base URL with `API_BASE=http://my-host:port`.

## When a test fails

1. Check the worker log — most engine bugs surface there
2. Set `DEBUG_WORKFLOW=1` on the worker for per-job result logging
3. Inspect `workflow_node_runs` for the failing enrollment — `error` column
   carries the handler-thrown message
4. The reconcile cron runs every 5 minutes — if an enrollment is stuck
   `active` with no live job, wait a cycle before declaring it broken
