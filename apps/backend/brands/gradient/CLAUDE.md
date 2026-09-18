# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`gradient-backend` — the Express 5 API behind The Gradient (thegradient.co.in / gradientlearnings.org). Two clients call it: `gradient-admin` (admin panel, port 4200) and `gradient-next-ui` (public site, port 3000). They are sibling repos under `../`. A feature usually spans this repo plus one of them.

**ESM, not CommonJS** — `"type": "module"` is set. Use `import`/`export`, and include the `.js` extension in every relative import. `models/index.js` uses top-level `await import()`.

Postgres via Sequelize is the only datastore. There is no MongoDB here.

## Commands

- `npm run dev` — nodemon on `src/server.js` (port from `PORT`)
- `npm run pg:migrate` — apply migrations
- `npm run pg:generate --name <name>` — new migration
- `npm run pg:undo` — roll back the last migration
- `npm run pg:seed:all` / `npm run pg:seed --seed <file>`

`.sequelizerc` redirects sequelize-cli to `src/database/postgres/{config.js,models,migrations,seeders}` — the CLI does not use the repo root.

There is **no test runner**. `src/test/*.js` are manual scripts run directly (`node src/test/email.test.js`); some of them send real email or hit a live DB, so read one before running it.

## Startup and layering

`src/server.js` → `connectDatabases()` → `initEmailProviders()` → `initAgendaJobs()` → listen. `src/app.js` builds the Express app and mounts every router.

Flow is `routes/ → controllers/ → database/postgres/models/`. `services/` is deliberately thin — it holds only the logic that more than one controller needs (`services/lead/createLead.service.js`, `services/course/courseEmail.service.js`, `services/email/`). Most business logic lives in the controller, which is the existing convention; don't refactor a feature into a service layer unless a second caller actually appears.

Controllers are named by role, not by entity: `crud.controller.js`, `public.controller.js`, `emailTemplate.controller.js` inside a per-feature folder.

## Route prefixes

Set in [src/app.js](src/app.js) — check there before writing a frontend service call:

`/upload` `/blogs` `/admins` `/resources` `/recordings` `/user` `/auth` `/events` `/leads` `/website` `/jobs` `/free-courses` `/courses` `/subscribers` `/campaigns` `/contacts` `/activity-logs` `/meta`

Within a router, admin endpoints sit under `/admin/...` and unauthenticated ones under `/public/...` (see [src/routes/course/course.routes.js](src/routes/course/course.routes.js) for the cleanest example of the split).

CORS is a hardcoded origin allowlist in `app.js`. A new frontend origin will silently fail until it is added there.

## Auth — two separate schemes

| | admin panel | public site users |
|---|---|---|
| middleware | `adminAuth` (`middlewares/adminAuth.middleware.js`) | `authMiddleware` (`middlewares/auth.middleware.js`) |
| transport | `Authorization: Bearer <token>` header | httpOnly cookie, key `USER_ACCESS_TOKEN_KEY` |
| sets | `req.admin` (full JWT payload) | `req.user = { id }` |
| checks | signature only | signature **and** `decoded.type === "website_user"` |

Both verify with the same `JWT_SECRET` via `util/jwt.util.js`. `adminAuth` does no role check — it only proves the token is valid, so any authenticated admin can reach any `adminAuth` route.

The exceptions are `requireRole(...roles)` (`middlewares/requireRole.middleware.js`), used after `adminAuth` on **`/activity-logs`, admin management (`/admins`, minus `/admins/auth/*`), and course create/delete (`POST /courses/admin/create`, `DELETE /courses/admin/courses/:id`)**. It reads `req.admin.role` (the AdminRole *name*, from the JWT), so a role change takes effect on the admin's next login — to cut access immediately, set `isActive: false`. Reuse it when a route genuinely needs a role; nothing outside those two areas enforces one yet.

The admin login token carries `{ id, roleId, role, name, email }`. `name`/`email` were added for the activity log; tokens issued before that are valid for 30 days and lack them, which the log handles with a cached lookup.

Put `adminAuth` on every new admin route. `POST /admins`, `GET /admins`, `GET/PATCH/DELETE /admins/:id` and `/upload/admin/*` were open until the activity log landed and are now protected; `/upload/resume` is public by design (the website's job-application dialog posts to it).

Admin management is Super Admin only — every `/admins` route except `/admins/auth/*` sits behind `superAdminOnly` in `routes/admin/admin.route.js`. Keep the auth routes open: login and the invite `set-password` flow are how a non-Super-Admin gets a token at all, and `/auth/me` runs on every panel page load.

### Admin onboarding and password flows

Token types and TTLs live in `config/constants/admin.js` (`ADMIN_TOKEN_TYPE`, `ADMIN_TOKEN_TTL`) — never inline the string `"invite"` or an expiry again. `POST /admins/auth/set-password` serves both types: an `INVITE` token is single-use (rejected once `inviteStatus` is `accepted`), a `PASSWORD_RESET` token is not, but expires in an hour.

| Situation | Endpoint | Email |
|---|---|---|
| Create, no password | `POST /admins` | `BODIES.ADMIN_INVITE` |
| Create with a temporary password | `POST /admins` + `password` | `BODIES.ADMIN_TEMP_PASSWORD` |
| Invite lost or expired | `POST /admins/:id/resend-invite` | `BODIES.ADMIN_INVITE` |
| Reset, admin picks their own | `POST /admins/:id/reset-password` `mode: "link"` | `BODIES.ADMIN_PASSWORD_RESET` |
| Reset, needs access now | same, `mode: "temporary"` | `BODIES.ADMIN_TEMP_PASSWORD` |

All five compose through `services/admin/adminEmail.service.js`. Two rules it encodes:

- **`sendMail` never throws**, so a mail outage must not fail the request — every helper returns `{ emailed }` next to the link it minted, and the controller returns the link either way so the panel can fall back to "copy this yourself". Don't turn a failed send into a 500; it would leave a half-created admin behind.
- **Temporary passwords are generated in the browser**, not here. The API only ever receives one to hash it, and never returns a plaintext password in a response body.

`lastSuperAdminBlocker` in `controllers/admin/crud.controller.js` 409s any update or delete that would leave zero *active* Super Admins. Since Users and Activity are both Super Admin–only, that state is unrecoverable without a manual DB write — and it is reachable from the UI now that roles are editable inline.

## Models and migrations

- Auto-loaded and associated by `database/postgres/models/index.js`; import the default export of that file and destructure (`const { Course, Lead } = db;`).
- Primary keys are **ULID strings**, not integers or UUIDs: `type: DataTypes.STRING, defaultValue: () => ulid()`. 20 of 21 models follow this.
- JSONB is used heavily for config-ish fields (`Course.pricing`, `Course.settings`, `Course.brochure`), with defaults in `config/constants/<feature>.js`. Partial updates are merged server-side so a form that posts one block cannot blank the others — preserve that when adding fields.
- There is **no `sequelize.sync`**. Every schema change needs both a model edit and a migration file.

## Responses and errors

Wrap every controller in `asyncWrapper` (all 26 currently are) so rejections reach the global handler. Return `res.status(n).json({ success, data | message })` directly for expected outcomes; let genuine errors throw. `middlewares/error.middleware.js` maps Sequelize validation/unique and JWT errors to 400/409/401 and only leaks a stack outside production.

Paginated lists use `getPaginationParams(req.query)` and `getMeta(total, page, limit)` from `util/helpers/pagination.js`.

## Email

`services/email/` is a small multi-provider sender — Outlook via MSAL/Graph and AWS SES, configured in `config/emailAccounts.js` and registered at boot by `initEmailProviders()`.

```js
import { sendMail, EMAIL_PROVIDER_ID } from "../services/email/index.js";
await sendMail({ fromEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL, to, subject, html, text });
```

Omitting `fromEmail` falls back through every provider in order until one succeeds. `sendMail` **never throws** — it resolves `{ success: false, error }`, so check the result.

HTML is composed with `buildEmail({ header, body, footer })` against the `HEADERS`/`BODIES`/`FOOTERS` registry (`templates/registry.js`). A new transactional email means a new body in `templates/bodies/` plus a registry entry, not inline HTML in a controller.

## Activity log

Every mutating request carrying an admin token is recorded in `activity_logs`. One global middleware does it — `app.use(activityLogger)` in `app.js`, before the routers — so **a new admin write route is logged without touching its controller**. Full design and verification notes in `../ACTIVITY_LOG_PLAN.md`.

### Checklist when you add an admin feature

Do these as part of the feature, not as a follow-up. The first two are the whole cost of participating.

**1. Register each write route** in `ACTIVITY_REGISTRY` (`services/activityLog/registry.js`):

```js
"PUT /courses/admin/courses/:id": entry(E.COURSE, V.UPDATED),
"PATCH /courses/admin/courses/:id/toggle-status": entry(E.COURSE, V.UPDATED, {
  verbFrom: (ctx) => (ctx.response?.isPublished ? V.PUBLISHED : V.UNPUBLISHED),
}),
"POST /courses/admin/create": entry(E.COURSE, V.CREATED, {
  entityIdFrom: "response.data.id",   // the id only exists in the response
  labelFrom: "body.name",             // whatever field holds the human name
}),
```

Keys are `"<METHOD> <baseUrl><route.path>"` — the pattern, not the interpolated URL. Add a new entity to `ACTIVITY_ENTITY` and any new verb to `ACTIVITY_VERB` in `config/constants/activityLog.js` rather than inlining strings.

Skipping registration is not fatal — the route still logs via a prefix fallback, tagged `metadata.unmappedRoute`, and its `routeKey` names the line to add — but the row will be coarse.

**2. Add a new entity to `LABEL_FIELDS`**, so rows say *which* record was touched. It lives in `services/activityLog/registry.js` alongside `ACTIVITY_REGISTRY` — **not** in `config/constants/activityLog.js`, which is where `ACTIVITY_ENTITY` and `ACTIVITY_VERB` live:

```js
[E.BLOG]: { model: "Blog", field: "title" },
```

The log then fills `entityLabel` in by itself after the response. Without it, every update reads "updated a blog post" instead of naming it — which is most of the feature's value. Note `Event` uses `eventTitle`, not `title`.

**3. For deletes, capture the label in the controller** — the automatic lookup cannot run once the row is gone:

```js
req.activity?.set({ entityLabel: blog.title });
await blog.destroy();
```

**4. Optionally, a field-level diff.** Worth it on the main edit screens; everything else falls back to the summarised request body:

```js
const before = snapshot(course, ["name", "pricing"]);
await course.update(updates);
req.activity?.set({
  entityLabel: course.name,
  changes: buildChanges(before, snapshot(course, Object.keys(before))),
});
```

For a bulk action, the count is the interesting part: `req.activity?.set({ metadata: { affectedCount: n } })`.

Always `req.activity?.` with the optional chain — scripts, jobs, and tests call controllers with no middleware mounted. Use `req.activity?.skip()` to suppress a row, and `entry(..., { skip: true })` for public routes that would otherwise be logged.

### Rules that are easy to break

- **The table is append-only.** No `updatedAt`, no write endpoints in `controllers/activityLog/`. Don't add either — a log the API can rewrite is not evidence of anything.
- **Actor name/email/role are denormalised snapshots** and there is deliberately no association to `AdminUser`, so a deleted admin's history survives. Don't add a `belongsTo`. Renaming or deleting an admin must call `invalidateActorCache(id)`.
- **Never store raw content.** `recordActivity` runs redact → summarise → cap, so long HTML becomes `<html, 48.2 KB>` and secrets become `[redacted]`. Write only through that service; add any new secret-ish field name to `ACTIVITY_REDACT_KEYS`.
- **Logging must never affect a request.** It is fire-and-forget after `res.on("finish")`; worst case is a `console.error`. Verified by renaming the table under a live server — requests still returned 200. Keep it that way.

Public-site writes (leads, subscribers, enrolments, event joins) are explicitly skipped — each already is its own timestamped record. `GET`s are never logged.

## Marketing campaigns

`/campaigns` and `/contacts` are bulk marketing email — audience resolution, sending, and reporting. Full design in `../MARKETING_CAMPAIGN_PLAN.md`. Three things about it are easy to get wrong from elsewhere in the codebase:

- **`subscribers` is no longer "newsletter signups".** It is now *every email address we hold and its consent state*, and it is the **suppression list**. Nothing else answers "may we email this address" — `contacts` deliberately has no status column, because two answers to that question is the bug the whole design exists to prevent. Only `services/subscriber/suppression.service.js` writes consent state.
- **Suppression is campaigns only.** `campaignSendJob` checks it; event reminders, certificates, password resets and admin invites do not. `FOOTERS.GRADIENT_MARKETING` — the footer carrying the unsubscribe link — is therefore for campaigns only. A reminder carrying a link that does not stop reminders would be a lie.
- **A source type with no resolver must be a named error, not an empty audience.** `CAMPAIGN_SOURCE_TYPE` is the vocabulary; the registry in `services/campaign/recipientResolver/index.js` is the implementation, and it is the authority. "Nobody matched" and "that source does not work" must never look the same to whoever is staring at a preview of zero.

Unsubscribe tokens are signed with a **secret derived from `JWT_SECRET`**, not `JWT_SECRET` itself, so a public unsubscribe link can never be replayed as an admin token (see `services/subscriber/unsubscribeToken.js`, and the `adminAuth` note above).

## Facebook lead ads

`/meta` imports leads from Facebook Lead Ad forms. Full design in
`../FACEBOOK_LEADS_PLAN.md`, operator guide in `docs/facebook-lead-integration.md`.

Four things about it are easy to get wrong from elsewhere:

- **Facebook leads are NOT in `leads`.** `meta_leads` is a separate table with
  its own screen, statuses and retention (decision recorded in the plan §2).
  Nothing about the website leads pipeline changed. The cost of that split is
  that everything downstream had to be wired by hand — `emitMetaLeadCreated`
  in `services/leadEvent/emitters.js` and `CAMPAIGN_SOURCE_TYPE.META_LEADS`
  with its resolver. **Anything new that consumes leads needs both tables**
  unless it deliberately means only one.
- **Two different dedupes, and conflating them is the bug.** `metaLeadId` is
  unique and stops the *same Facebook lead* importing twice — infrastructure,
  no row created. `status: duplicate` records that the *same person* filled a
  second form — information, row kept. The poll log counter is called
  `alreadyImported` for exactly this reason; do not rename it to `duplicates`.
- **Source/sub source is a managed catalogue, not free text.** `meta_sources`
  is a two-level tree (`parentId IS NULL` is a source), edited from the Meta
  Leads screen and *picked* by `meta_forms` and `meta_accounts` via id. Its
  `key` is immutable by design — leads store a frozen copy, so changing it would
  split one source into two rather than migrate anything. Deleting is refused
  while anything references it; retire instead.
- **Routing is frozen onto each lead at import.** `meta_forms` holds the
  current rule, `meta_leads` holds the rule that applied to that lead. Never
  resolve attribution by joining to the form at read time — remapping a form
  would silently rewrite history. The one sanctioned rewrite is
  `PUT /meta/forms/:formId` with `reattributeExisting: true`, which the panel
  only sends after asking; it must stay opt-in and must keep recording the row
  count on the activity entry.
- **`sourceCreatedAt` is Facebook's timestamp; `createdAt` is ours.** They
  differ by years on a backfilled row. Every list, filter and date range uses
  `sourceCreatedAt`.

Page tokens are AES-256-GCM encrypted (`util/tokenCrypto.js`,
`TOKEN_ENCRYPTION_KEY`) and never returned to a client. `pageToken` and
`pageTokenEnc` are in `ACTIVITY_REDACT_KEYS` — keep them there, or the first
`POST /meta/accounts` writes a live credential into an append-only table.

The role split is **credentials and destruction**, not "configuration". Any
authenticated admin can read leads, manage the source catalogue, map forms, run
backfills, trigger a poll and read the monitoring tab — that is lead work.
Super Admin is required for exactly four routes, gated individually rather than
with a `router.use` block: `POST`/`PUT /meta/accounts` (both accept a
`pageToken`), `DELETE /meta/accounts/:id` (cascades to every lead imported
through the page), and `PUT /meta/settings` (the global ingestion switch, which
is strictly broader than disabling one account). Nothing on the open side ever
returns a token — `list` reports `hasToken` as a boolean, and validate/sync use
the stored token server-side.

**Facebook leads can start a workflow.** `metaLeads` is a realtime workflow
trigger source, narrowed by **form** and nothing else — an ad is swapped weekly
and a campaign renamed mid-flight, so a trigger keyed on either quietly stops
firing. Two guards in `services/workflow/triggers/sourceLoader.js` stop it
mailing history, and **anything new that enrols from `meta_leads` needs both**:
a row whose `importedVia` is `backfill` never enrols, and a row whose
`sourceCreatedAt` is more than six hours old never enrols. Without them, mapping
one old form sends a welcome email to everybody who ever filled it. A `skipped`
lead starts nothing (no email, nobody to mail); a `duplicate` lead does, because
that is a real second submission — not the importer's `alreadyImported`, which
creates no row at all.

`GET /meta/forms` is the flat list of every form across every account, for
pickers outside the Meta screen. `GET /meta/accounts/:id/forms` stays the
per-account one the Meta screen itself uses.

## Background jobs and uploads

- Agenda runs on the **Postgres** backend (`agenda_jobs` table), not Mongo. It is gated by `AGENDA_JOBS_ENABLED=true`; with it off, jobs are defined but never run — expect that locally. Register new jobs in `jobs/index.js`.
- **Workflow automations use BullMQ on Redis, not Agenda**, and run in a second process: `npm run worker` (`worker:dev` for nodemon). Gated by `WORKFLOWS_ENABLED=true`. The two schedulers coexist — campaigns, reminders and certificates stay on Agenda.

  Redis for local work is a container, with npm scripts for it:

  ```
  npm run redis:up      # create it (first time)
  npm run redis:start   # start the existing one
  npm run redis:stop
  npm run redis:ping    # PONG
  npm run redis:check   # must print noeviction
  npm run redis:cli
  npm run redis:down    # destroy the container
  ```

  Two settings that are not optional. **`maxmemory-policy noeviction`** — a wait is stored as a delayed BullMQ job, and a policy that may evict it turns "wait three days" into "never"; `redis:up` sets it and `redis:check` proves it. And **`WORKFLOW_QUEUE_PREFIX` must differ per environment** — two environments sharing a Redis with the same prefix means staging's worker consumes production's jobs and mails real people from test data.
- Uploads: multer memory storage (20 MB cap) → S3 (`config/awsS3.js`). Only the S3 key is stored; public URLs are built from `AWS_FILE_BASE_URL` (CDN in front of the bucket), matching `resolveStorageUrl` in both frontends.

## Session recordings

`/recordings` is the gated YouTube library — a listing page of chips and cards,
and a detail page whose video sits behind a sign-in and a short form. Full
design, build record and open questions in `../RECORDINGS_PLAN.md`. Three
tables: `Recordings`, `RecordingCategories` (the chip catalogue),
`RecordingLeads`.

These are easy to get wrong from elsewhere:

- **`video.url` never leaves `public.controller.js` while the recording is
  gated.** It is emitted by `lead.controller.js` and nowhere else — by the gate
  POST, and by `GET /recordings/public/watch-state` for somebody who has already
  passed that recording's gate. A YouTube link is not a secret and nobody is
  pretending otherwise, but shipping it in the page payload and letting the
  frontend hide the iframe puts it in view-source and makes the conversion
  number fiction. Anything new that returns a recording must strip it the same
  way.
- **Watching a gated recording requires a website account.** Both gate endpoints
  sit behind `authMiddleware`. **An ungated recording (`settings.gateVideo:
  false`) is exempt from all of it**: that switch means "plays for anybody", its
  video ships with the public payload, and neither endpoint is on the path to
  one.
- **`userId` is the identity; the email is just an address.** Every form field
  is editable, the account's name and email included — they seed the form and
  nothing more. `userId` is written from the session on every lead, so an edited
  address changes what we contact somebody on and never whose row it is. That is
  why `findOwnLead` keys on `userId` (with an `email` arm only for rows predating
  the login gate): looking up by the account's address would never find a lead
  passed under a work one, and the person would be re-asked forever. The table is
  still unique on (recordingId, email), so a typed address can collide — that is
  a named 409, not the generic one.
- **The form is asked for once, then carried forward.** A second recording is
  one click: `watchProfile.service.js` resolves the person's last confirmed
  details and `createRecordingLead` copies them onto a new row, `source:
  "carried"`. The carry expires — `isRecordingProfileStale`, 30 days, or the
  moment a self-described student's graduation year passes — and then the form
  returns prefilled as a confirmation.
- **Freshness is measured on `detailsConfirmedAt`, never on `createdAt`.** A
  carried row is created today out of details typed months ago, so it copies
  that timestamp forward unchanged; measuring on `createdAt` would reset the
  clock on every carry and the window would never once expire. Anything new
  that writes a `RecordingLeads` row has to carry it or set it, not default it.
- **The profile lookup falls back from `userId` to `email`.** Every row written
  before accounts were required has `userId: null`; without the fallback, all
  of those people are asked to re-type details already on file. Rows found that
  way are claimed (`userId` backfilled) so the cheap lookup finds them next.
- **`RecordingLeads` is unique on (recordingId, email), unlike `ResourceLeads`.**
  A download happens once; a recording's gate reappears on every new device, so
  unconditional inserts would make the lead count mostly repeat visitors. A
  repeat is a 200 that bumps `submissionCount`, not a 409. Two counters, two
  questions: `submissionCount`/`viewCount` count *passes*, the row count counts
  *people*. Do not conflate them, and do not label `submissionCount` as views in
  a UI.
- **There is one viewing number, and it is `leadCount`.** People, not plays:
  one `RecordingLeads` row per (recording, person), so somebody who opens a
  recording ten times across four devices is one view. `resolveLeadCounts` in
  `crud.controller.js` is the only place it is computed, used by both the list
  and the detail endpoint so the two screens cannot disagree. The panel labels
  it **Views**.
- **`viewCount` is not that number and is rendered nowhere.** It counts gate
  passes, which tracked repeats meaningfully only while the gate reappeared on
  every device; the per-account unlock ended that, so it now moves with
  `leadCount` on anything recent while carrying historical inflation on older
  rows. Kept as the record of what happened under the old behaviour. Do not
  surface it, and do not derive anything from it — a `viewCount - leadCount`
  subtraction silently answers a question the system stopped asking.
- **A first-timer/returning split briefly existed and was removed** (27 Aug
  2026, `RECORDINGS_PLAN.md` §19). Do not reintroduce `newViews`/`repeatViews`
  without asking: the decision was one honest number over two derived ones.
- **The lead-event and workflow hooks fire on `afterCreate` only.** A repeat
  pass updates the row, so nothing re-fires — that is what stops somebody being
  re-enrolled for opening a recording on their phone.
- **`content` is the growth column, `RECORDING_CONTENT_KEYS` is its contract.**
  New prose blocks are keys in that JSONB, not new columns, and the controller
  drops keys the constant does not name. The admin form is meant to render
  itself from the same list, so adding a block stays a one-line change.

**`format` is a column, and there is no link to `Events`.** The badge —
Workshop, Hackathon, Teardown — is picked in the admin and stored on the row,
validated against `EVENT_TYPES` in `config/constants/event.js`. That constant is
shared with `Event.eventType`, so the two lists cannot drift; adding a fourth
kind of session is one edit.

It went the other way first. `format` was a column, then became
`recording.event?.eventType` read through a `belongsTo(Event)` with a unique
index behind it, and is now a column again — dropped and restored by
`20260825160000-recording-format-replaces-event-link`, which backfills from the
event before removing `eventId`, its FK and `recordings_event_id_unique`.

The reason the derived version lost is worth writing down, because the argument
for it was good: derived-then-stored is a cache, and a cache with no
invalidation is a second source of truth waiting to disagree. What it could not
answer was everything else — a join on every public read, a searchable picker,
a uniqueness rule, a 409 with recovery instructions, and no way at all to badge
a recording that never had a live session behind it. That is a large mechanism
to own one word. A stale badge is a smaller problem than a badge you cannot set.

**List sorts are whitelisted, checked with `Object.hasOwn`.** An `order` built
from a query string is a column name the caller chooses; `sort=constructor`
would otherwise hand Sequelize the `Object` constructor and 500 the list. Leads
is deliberately not a sort option: the count comes from a separate grouped query
over the rows already chosen, so it would sort a page picked without it.

**Category is required on create** (400 without it, 400 if it does not exist)
even though the column is nullable — deleting a category `SET NULL`s existing
rows, which must keep working, but a *new* recording filed nowhere is invisible
to the only navigation the section has.

Categories are a **managed catalogue**, not free text — ordered, slugged and
curated, the same shape as `meta_sources`, because the chip row is the public
page's primary navigation. Deleting one is `SET NULL`: the recordings survive
and become uncategorised, which is why the list endpoint returns
`recordingCount` and delete returns `uncategorisedRecordings`.

**There is no cross-sell link.** `relatedCourseId`, its FK to `Courses`, its
index, the `relatedCourse` association and the `showRelatedCourse` setting were
all dropped (`20260825120000-drop-recording-related-course`) once the "GO DEEPER
WITH THE COURSE" card became static copy on the website. A recording knows
nothing about courses. Do not re-add the link without a public page that reads
it — an admin field that saves a value nothing renders is worse than no field.

No role gating anywhere: recordings are content, like Blog and Resources.

`util/helpers/youtube.js` parses a URL to a video id and **refuses what it
cannot read** rather than storing null — a recording with `videoId: null` looks
fine in every list and is a dead player in production. Publishing is blocked
until there is one.

## Courses

Creating and deleting a course are **Super Admin only** (`requireRole` in `routes/course/course.routes.js`); configuring an existing one is open to any admin. Delete also 409s when the course has leads, so the only courses that can actually be destroyed are ones that never converted.

`Course` holds the **commercial layer only** — pricing, brochure, settings, email templates, leads. Each course's marketing page is hand-built in `gradient-next-ui`; it reads this config at request time via `GET /courses/public/:slug` and falls back to values compiled into the page if the API is down. So: never add page copy, sections, or layout data to the course model, and treat `slug` as immutable after creation (the live URL and every lead's `source` key off it).

## Environment

`config/env.js` is the single reader of `process.env` — add new vars there rather than reaching for `process.env` in feature code. Required: `PORT`, `POSTGRES_*`, `JWT_SECRET`, `AWS_*` (S3), `AWS_SES_*`, `OUTLOOK_1_*`, `GOOGLE_AUTH_CLIENT_ID/SECRET`, `AWS_FILE_BASE_URL`, `AGENDA_JOBS_ENABLED`.
