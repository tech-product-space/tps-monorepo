# apps/backend — unified backend

One repo, three bootable targets, selected by `BRAND`:

```
BRAND=tps      npm start   # native TPS content domain (server.tps.js, this dir's own code)
BRAND=gradient npm start   # Gradient content domain  (brands/gradient/, real ESM, own node_modules)
BRAND=crm      npm start   # shared CRM/sales service (crm/, own node_modules)
```

See `server.js` for the dispatcher and `../../../BACKEND-CONSOLIDATION-PLAN.md` at the repo root for the full design rationale (§2–§9).

## Why three subtrees instead of one merged `node_modules`

`gradient-backend` and `tps-crm-backend` pin different majors of dependencies the native TPS code also uses (`multer` v1 vs v2, `agenda` v5 vs v6, `ioredis`/`bullmq` majors). Hoisting everything into one `package.json` would force a breaking version change on at least one of the three. Instead:

- `apps/backend/` (this directory) — the TPS content domain, CommonJS, its own `node_modules`.
- `apps/backend/brands/gradient/` — the Gradient content domain, **real ESM** (`"type": "module"` in its own `package.json` — Node respects nested `package.json` module-type boundaries), its own `node_modules`.
- `apps/backend/crm/` — the shared CRM/sales domain, CommonJS, its own `node_modules`.

`npm install` at this directory's root triggers `postinstall`, which cascades `npm install` into `brands/gradient` and `crm` too. Each subtree keeps its own migrations, its own DB connection config, and its own `.env` — they are still, in effect, three separately deployable apps. What's unified is the **repo** (one place to find/change all three, one CI pipeline, shared conventions going forward) and the **admin identity layer** (below) — not the runtime process or the database.

## Unified admin identity

Previously three separate admin-identity stores (`gradient-backend`'s `AdminUser`, `tps-next-backend`'s `company`, `tps-crm-backend`'s `User`). Now:

- **`crm/src/models/user.js`** (`users` table) is the canonical identity — one row per admin, regardless of how many workspaces (gradient / tps / crm) they touch.
- **`crm/src/models/admin_workspace_grant.js`** (`admin_workspace_grants` table, migration `20260918000001`) — one row per (user, workspace) with a role scoped to that workspace. A user with no grant row for a workspace has no access to it.
- **Login is one endpoint**: `POST /api/v1/auth/login` on the CRM target (`crm/src/controllers/auth.controller.js`). It returns an access+refresh JWT pair whose payload includes `workspaces: [{ workspace, role }, ...]`.
- **TPS (`middlewares/requireStaff.js`) and Gradient (`brands/gradient/src/middlewares/adminAuth.middleware.js`) both trust that JWT directly** — they no longer issue their own admin tokens. Each **JIT-provisions** a local identity row (`company` for TPS, `AdminUser`+`AdminRole` for Gradient) keyed by email the first time a given admin is seen, so existing foreign keys into `tps_db`/`gradient_db` (staff_id columns, activity-log actor snapshots, etc.) keep working without a data migration. The local row's `role` is kept in sync with the workspace grant on every request; its `password` is always `null` — nobody logs in locally anymore.

**This means `JWT_SECRET` must be set to the exact same value across all three deployed targets (`tps`, `gradient`, `crm`).** A mismatch doesn't error loudly — tokens just silently fail to verify on whichever target has a different secret.

**Before cutover, run the grant backfill once**: `npm run backfill:workspace-grants` (needs `DATABASE_URL_TPS`, `DATABASE_URL_GRADIENT`, `DATABASE_URL_CRM` set — see `scripts/backfill-workspace-grants.js`). Migration `20260918000001` only backfills `crm`-workspace grants (it runs inside `crm_db`, where `users` already lives); it has no way to see `company` (tps_db) or `admin_users` (gradient_db) since those are separate databases. Skipping this script means every existing TPS/Gradient admin has zero workspace grants after cutover and is locked out of `unified-admin` until granted manually.

## What's genuinely unified vs. what's copied side-by-side

Done in this pass:
- Repo layout, `BRAND` dispatcher, cascading install.
- Shared admin identity (`users` + `admin_workspace_grants` in `crm_db`), consumed by all three targets.

Not yet done (see the consolidation plan §4 for the design, this is the remaining work):
- Field-level schema harmonization between `gradient-backend`'s and `tps-next-backend`'s overlapping content models (courses, events, blog, recordings/resources, Meta Lead Ads) — they're copied in as-is here, still two different shapes.
- API versioning is still inconsistent between targets (`crm` is `/api/v1/*`; `tps` and `gradient` are mostly unversioned).
- The CRM's own business logic still runs as a fully separate process (Option B in the plan, §6) rather than in-process with the other two — recommended to keep it that way through the initial migration since it owns payments.
