# Workflow engine — developer guide

A short map of how this feature is wired, what each file owns, and how to
extend it. Read this once and you'll know where to plug in.

---

## What this feature does

Lets admins build n8n-style automations: triggers (realtime form/event/resource
submission, or static list "Run") fan out to leads, who then move through a
DAG of nodes (send email, delay, branch on condition, goal). State lives in
Postgres; orchestration runs on BullMQ workers backed by Redis.

---

## Lifecycle — realtime trigger (`trigger.new_lead`)

```
form submit / event registration / resource download
  → Sequelize INSERT into PlatformLead | EventGuests | ResourceLead | etc
  → model afterCreate hook (models/EventGuests.js, etc)
  → fireAfterCreate(sourceType, sourceId)        triggers/hookHelper.js
  → enqueueEvaluateTrigger() on workflow.evaluate-triggers queue
  → workflowWorker picks job                     workers/workflowWorker.js
  → evaluateTriggers(job)                        engine/triggerEvaluator.js
       loadLead(sourceType, sourceId)            triggers/leadLoader.js
       for each ACTIVE workflow with trigger.new_lead:
         leadMatchesFilter()                     triggers/matchers.js
         IN_FLIGHT check (identity-aware)        compliance/identityMatch.js
         past-run check (if allow_re_enrollment off)
         global cap check                        compliance/enrollmentCap.js
       → create WorkflowEnrollment + enqueueAdvance
  → advanceEnrollment(job)                       engine/advanceEnrollment.js
       loop: handler.execute({enrollment, node, edges, workflow, nodeRun, tx})
       → next node, or park (delay/condition), or terminate
```

## Lifecycle — static-list trigger (`trigger.static_list`)

```
admin clicks Run in the UI
  → POST /workflows/:id/run → enqueueBulkEnroll
  → workflowWorker picks job
  → runBulkEnroll(job)                           publish/enrollBulk.js
       buildRecipients(filter)                   service/campaign/campaignRecipientBuilder.js
       filterOutExistingEnrollments (identity)
       filterOutCapExceeded (identity)
       chunk-insert WorkflowEnrollment rows in transactions
       enqueueAdvance for each
  → advanceEnrollment(...)  [same as realtime from here]
```

## Lifecycle — delays and conditions

- `control.delay` schedules the next advance for `now + duration`. State stays
  ACTIVE; `next_scheduled_at` is the deadline. BullMQ delays the job.
- `control.condition` PARKS the enrollment (status → WAITING), creates a
  `WorkflowConditionWaiter` row, and schedules a timeout advance. When a
  matching `LeadEvent` arrives, `wakeWaiters` re-enqueues advance early.
  The handler resolves match-vs-no-match and routes to the labeled edge.

---

## File map

### Constants & models
- `constants/workflow.js` — every enum lives here: `WORKFLOW_STATUS`,
  `ENROLLMENT_STATUS`, `NODE_TYPE`, `TRIGGER_TYPE`, `LEAD_SOURCE_TYPE`,
  `ENROLLMENT_SOURCE`, `LEAD_EVENT_TYPE`, `EDGE_LABEL`, `DURATION_UNIT`.
- `models/Workflow.js`, `WorkflowVersion.js`, `WorkflowEnrollment.js`,
  `WorkflowNodeRun.js`, `WorkflowConditionWaiter.js`, `WorkflowGlobalSetting.js`,
  `LeadEvent.js`.

### Queues & workers
- `queues/workflowQueues.js` — three queues: `workflow.advance`,
  `workflow.bulk-enroll`, `workflow.evaluate-triggers`. Exposes
  `enqueueAdvance`, `enqueueBulkEnroll`, `enqueueEvaluateTrigger`.
- `workers/workflowWorker.js` — registers BullMQ Workers and the reconcile
  cron. Logs every `evaluate-triggers` outcome with the source tag.

### Engine
- `engine/triggerEvaluator.js` — realtime trigger handler. Owns the IN_FLIGHT
  + past-run + cap gates.
- `engine/advanceEnrollment.js` — main state machine. Loads enrollment,
  finds current node, calls the registered handler, persists outcome, loops
  until park / terminate / error.
- `engine/handlerRegistry.js` — `NODE_TYPE → handler.execute` map.
- `engine/nodeHandlers/` — one file per node type:
  `action.send_email.js`, `control.delay.js`, `control.condition.js`,
  `control.goal.js`.
- `engine/utils/` — `interpolate.js` (`{{name}}` substitution),
  `computeDelay.js`, `pickNextNode.js`.

### Triggers
- `triggers/hookHelper.js` — `fireAfterCreate(sourceType, sourceId, options)`.
  Sequelize `afterCreate` / `afterBulkCreate` calls this. Defers to
  `transaction.afterCommit` if inside a transaction.
- `triggers/leadLoader.js` — normalizes a source row into
  `{source_type, source_id, email, name, phone, raw}`. One case per source.
- `triggers/matchers.js` — per-source predicate. Map `MATCHERS[sourceType]`.

### Dispatchers
- `dispatchers/emailDispatcher.js` — wraps `service/mail/sendEmail`. Opt-out
  guard, tracking pixel+link rewrite, branded HTML wrapper, `List-Unsubscribe`
  headers, returns `{outcome, providerMessageId, providerNativeId}`.

### Compliance
- `compliance/identityMatch.js` — `buildIdentityOr({...})` returns an OR
  clause matching `lower(email)` OR `phone` OR `(source_type, source_id)`.
  Use this whenever a query should treat the same person consistently.
- `compliance/enrollmentCap.js` — `canEnrollLead(...)` checks the global
  active-workflow cap (default 1). Identity-aware via the helper above.
- `compliance/optOutGuard.js` — `isEmailOptedOut(...)` short-circuit before
  dispatching email.

### Tracking
- `tracking/rewriteForTracking.js` — rewrites absolute `<a href>` to click
  redirector, appends open pixel. No-op if `PUBLIC_TRACKING_BASE_URL` unset.
- `tracking/trackingToken.js`, `unsubscribeToken.js` — HMAC-signed tokens
  for click / open / unsubscribe URLs.

### Events & wake
- `events/recordLeadEvent.js` — writes `LeadEvent` rows (email.sent/opened/
  clicked, page.visited, etc). Dedupe-keyed.
- `events/wakeWaiters.js` — on a new matching `LeadEvent`, re-enqueues
  any parked condition waiters early.

### Publish & validation
- `publish/publishWorkflow.js` — validates definition + trigger config,
  freezes a `WorkflowVersion`, sets workflow → ACTIVE. Owns `VERIFIED_SENDERS`
  for backend-side email-sender validation.
- `publish/enrollBulk.js` — `runBulkEnroll(job)` for static-list runs.
- `validation/dagValidator.js` — graph shape validation.
- `validation/nodeConfigSchemas.js` — per-node-type config validation.

### Settings & reconcile
- `settings/globalSettings.js` — `getGlobalSettings()` /
  `updateGlobalSettings()`. Currently surfaces `max_active_workflows_per_lead`
  (default 1). Process-local cache, 60s TTL.
- `reconcile/reconcileEnrollments.js` — cron that picks up enrollments whose
  `next_scheduled_at < now()` but who have no live BullMQ job (e.g. Redis
  lost the job during a restart). Safety net.

---

## How to add X — recipes

### 1. Add a new node type (e.g. `action.send_sms`)

1. Add `NODE_TYPE.ACTION_SEND_SMS = "action.send_sms"` in
   `constants/workflow.js`.
2. Add a validation schema for its config in
   `validation/nodeConfigSchemas.js`.
3. Create `engine/nodeHandlers/action.send_sms.js`. Export:
   ```js
   exports.execute = async ({enrollment, node, edges, workflow, nodeRun, tx}) => {
     // ...
     return { outcome: "next" }; // or "park" / "skip" / "cancel"
   };
   ```
4. Register the handler in `engine/handlerRegistry.js`.
5. Build the admin UI piece (node config sheet + canvas chip).
6. If the node sends messages, create a corresponding dispatcher under
   `dispatchers/` and call it from the handler.

### 2. Add a new lead source (e.g. `whatsapp_leads`)

1. Add `LEAD_SOURCE_TYPE.WHATSAPP_LEADS = "whatsapp_leads"`.
2. In the Sequelize model for the source row, add hooks:
   ```js
   hooks: {
     afterCreate: (row, options) =>
       fireAfterCreate("whatsapp_leads", row.id, options),
     afterBulkCreate: (rows, options) => {
       for (const row of rows) fireAfterCreate("whatsapp_leads", row.id, options);
     },
   }
   ```
3. Add a case in `triggers/leadLoader.js` returning the normalized shape.
4. Write a predicate in `triggers/matchers.js` and add it to `MATCHERS`.
5. Add a section in `tabs/triggers/WebsiteFormPicker.tsx` (admin) with its
   own encode/decode branch.
6. Add the source key to `SUPPORTED` in `publish/publishWorkflow.js`.
7. Add a case in `controllers/workflow/enrollment.controller.js`
   `resolveTriggerSource` so the enrollment detail page labels it.

### 3. Add a new trigger type (e.g. `trigger.recurring_cron`)

1. Add `TRIGGER_TYPE.RECURRING_CRON` in `constants/workflow.js`.
2. Add a validation block in `publish/publishWorkflow.js` next to the
   existing trigger validators.
3. Pick a firing model:
   - Queue-driven (like new_lead / static_list): write a new queue + worker.
   - Cron-driven: register an agenda or BullMQ-Repeatable job; the firing
     code calls into the existing `enqueueAdvance` after creating enrollments.
4. Add `ENROLLMENT_SOURCE.YOUR_KIND` if "new_lead"/"static_list"/"manual"
   don't fit.
5. Admin UI: new `tabs/triggers/YourTrigger.tsx` plus wire-up in
   `tabs/WorkflowEditorTab.tsx`.

### 4. Add a new dispatcher (e.g. SMS, push, Slack)

1. Create `dispatchers/smsDispatcher.js`. Pattern:
   ```js
   async function dispatchSms({to, body, leadSourceType, leadSourceId, enrollmentId, nodeRunId}) {
     if (!to) return {outcome: "no_recipient"};
     if (await isOptedOut(...)) return {outcome: "opted_out"};
     // mint correlation id, call provider, record events
     return {outcome: "sent", providerMessageId, providerNativeId};
   }
   ```
2. Extend `compliance/optOutGuard.js` with a per-channel check if you have
   one (`isSmsOptedOut`).
3. Wire it from the corresponding node handler.

### 5. Add a new form to the realtime "Forms / events / resources" picker

1. Edit `product-space-admin/.../leadFormCatalog.ts` — add the entry with
   `type`, `label`, `category`.
2. Mirror the label in `LEAD_FORM_LABELS` inside
   `controllers/workflow/enrollment.controller.js` so the enrollment detail
   page can describe it.
3. No engine change — matchers compare against the lead row's `type` field.

---

## Contracts

### Node handler

```js
exports.execute = async ({enrollment, node, edges, workflow, nodeRun, tx}) => {
  return {
    outcome: "next" | "park" | "skip" | "cancel" | "fail",
    next_node_id?: string,   // override default edge
    reason?: string,         // for skip / cancel / fail
    output?: object,         // recorded on WorkflowNodeRun.output
    provider_message_id?: string,
  };
};
```
- `next` — proceed to the labeled / default next edge. `park` — engine
  pauses advance (status WAITING/PAUSED). `skip` — recorded as skipped,
  proceeds. `cancel` — terminates enrollment with reason. `fail` — throw
  with `err.retryable = true|false`.

### Dispatcher

```js
{outcome: "sent" | "opted_out" | "no_email" | "no_recipient" | "failed",
 providerMessageId?, providerNativeId?, reason?}
```

### Matcher

```js
function matchXYZ(leadRawRow, perSourceFilters): boolean
```
Empty / missing filter ⇒ match-all for that source.

---

## Gotchas

- **Wildcard semantics** — `matchEventGuest` / `matchResourceLead` treat
  `filters: {}` as match-all but `filters: {eventFilters: {}}` as match-none.
  The frontend encoder respects this; preserve it if you add new matchers.
- **Identity dedupe everywhere** — per-workflow IN_FLIGHT, past-run, cap,
  and static-list pre-filter all run through `buildIdentityOr` so the same
  person across `events` and `platform_leads` is treated as one. New checks
  should use the helper.
- **Cap excludeWorkflowId** — `canEnrollLead` excludes the target workflow
  so the lead's own existing enrollment in it doesn't self-block. Same-
  workflow dedupe is the IN_FLIGHT path's job.
- **Tracking runs before the wrapper** — `emailDispatcher` rewrites links +
  inserts open pixel on the authored content, THEN wraps. Don't swap. The
  wrapper's Unsubscribe link is intentionally outside the click tracker.
- **Workflow paused → retry, not skip** — `advanceEnrollment` throws
  `workflow_paused` with `retryable=true, retryDelay=60s`. BullMQ holds
  the job. On resume the next retry succeeds. So delay/wait windows
  effectively extend during a pause.
- **Condition node "did X happen in N days?" check has no upper bound** —
  `LeadEvent.occurred_at >= waiter.createdAt`. If the workflow was paused
  past the timeout, late events still match. Cancel enrollments rather than
  pausing if you don't want this.
- **`enrollment_source` ≠ `lead_source_type`** — first is the trigger kind
  (new_lead/static_list/manual), second is the source row table
  (platform_leads/events/...). They're orthogonal; a static-list enrollment
  can have `lead_source_type=events`.
- **DB unique index** — `uniq_active_workflow_enrollment` on
  `(workflow_id, lead_source_type, lead_source_id) WHERE status='active'`
  only enforces ACTIVE. PAUSED/WAITING are guarded by application code; if
  you add a new in-flight-like status, update the application checks.
- **`VERIFIED_SENDERS` lives twice** — frontend `editor/utils.ts` controls
  the dropdown; backend `publishWorkflow.js` controls publish-time
  validation. They can diverge intentionally (e.g. legacy gradient senders
  valid backend-side but hidden from the picker).
- **`LEAD_FORM_LABELS` lives twice** — frontend `leadFormCatalog.ts` and
  backend `enrollment.controller.js`. Keep both in sync when adding forms.

---

## Observability

- Worker logs every `evaluate-triggers` outcome with the source tag:
  `[workflow.evaluate-triggers] N src=events:123 → {"evaluated":1,"enrolled":1,...}`.
- Per-skip reasons log inside `triggerEvaluator.js` (FILTER / IN_FLIGHT /
  PAST_RUN / cap blocked).
- Set `DEBUG_WORKFLOW=1` to widen advance-worker logging.

---

## Testing tips

- Sandbox scripts under `sandbox/` (`e2e-workflow.js`,
  `e2e-realtime-trigger-test.js`, `e2e-pause-resume-test.js`) are full
  end-to-end harnesses that drive the engine without going through the API.
- Set `PUBLIC_TRACKING_BASE_URL` to a localhost ngrok URL to exercise
  click/open/unsubscribe locally.
- The reconcile cron will pick up stranded enrollments if you simulate a
  Redis crash — useful for verifying recovery paths.
