# Product Space backend monorepo

One backend for three brands — **tps** (The Product Space), **gradient** (The Gradient) and **crm** (the sales CRM) — running in one process against **one Postgres database**, with **one schema per brand**.

```
apps/api/        gateway: mounts the three brand apps
apps/worker/     crons, Agenda jobs and BullMQ workers for all brands
packages/tps/        was tps-next-backend      (CommonJS)
packages/gradient/   was gradient-backend      (ESM)
packages/crm/        was tps-crm-backend       (CommonJS)
packages/env/        brand-scoped process.env + Postgres schema helpers
```

## How the brands stay separate

| Concern | How |
|---|---|
| **Tables** | One database, schemas `tps`, `gradient`, `crm`. Every connection a brand opens sets `search_path` to its schema (`packages/env/db.js`), so models, raw SQL, FKs, enum types and all existing migrations work **unchanged**. Each schema has its own `SequelizeMeta`. |
| **Routes** | `/tps/*`, `/gradient/*`, `/crm/*` (CRM keeps its inner `/api/v1`, e.g. `/crm/api/v1/leads`). Each brand is an Express **sub-app**, so its middleware stack (CRM raw-body webhooks, TPS open CORS, Gradient activity logger) never leaks into another. |
| **Legacy URLs** | The same sub-apps are also served at the root of their old hostnames (`*_LEGACY_HOSTS`), so Cal.com / Razorpay / Cashfree / SES / OAuth callbacks, links in already-sent emails and the frontends keep working while they migrate. |
| **Env** | One `.env`. Brand values are `TPS_*` / `GRADIENT_*` / `CRM_*`; the code reads `<BRAND>_X` first and falls back to plain `X`. Every `process.env` in the brand packages was replaced with `psEnv` (`@ps/env/<brand>`). |
| **Auth** | Unchanged and separate per brand. The gateway **refuses to boot** if two brands share a `JWT_SECRET` or a `PG_SCHEMA`. |

`BRANDS=tps,gradient,crm` chooses which brands run in a process, so the same build can be split across instances later.

## Run

```bash
cp .env.example .env            # fill in
npm install
npm run db:schemas              # CREATE SCHEMA IF NOT EXISTS tps/gradient/crm
npm run migrate:crm && npm run migrate:gradient && npm run migrate:tps
npm start                       # gateway on $PORT
npm run worker                  # exactly one of these per deployment
```

Each package still runs standalone from its old `.env` (no `PG_SCHEMA`, no `DATABASE_URL`) — `npm start --workspace @ps/crm` — which is the rollback path.

Background work must run **once per deployment**: keep `RUN_WORKERS_IN_API=false` and run `apps/worker`, or (tiny box) set it `true` and don't run a separate worker.

## Changes made to the original code

Everything else is the original code, moved in as-is.

- `tps/app.js`, `crm/src/app.js`, `gradient/src/boot.js` — the app / startup split out of `server.js` / `index.js` so it can be imported without listening or starting crons. The old entrypoints still work.
- `psEnv` replaces `process.env` everywhere (codemod; 147 files).
- DB config (`tps/config/config.js`, `crm/src/config/database.js`, `gradient/src/database/postgres/{sequelize,config}.js`, `gradient/src/config/agenda.js`) accepts a shared `DATABASE_URL` + `PG_SCHEMA`. TPS's second Sequelize instance (`config/db.js`) now re-exports the one from `models/`.
- `crm/src/middlewares/readOnly.middleware.js` and `gradient/src/middlewares/activityLog.middleware.js` derive paths from `originalUrl`/`baseUrl`; both now strip the mount prefix so they behave identically under `/crm`, `/gradient` and on a legacy host.

## Known limits

- `search_path` is set with Postgres's `options` startup parameter: fine against RDS directly, **not** through PgBouncer in transaction mode.
- Three Sequelize pools share one RDS `max_connections` — size `DB_POOL_MAX` per brand.
- Dependency versions differ between the brands (agenda 5 vs 6, bullmq 5 vs 6, multer 1 vs 2, msal 3 vs 5); npm nests the conflicts. Deduping is a later cleanup.
- CRM's maintenance scripts that read the TPS database (`TPS_DATABASE_URL`) still use a URL; they can become plain cross-schema reads later.
- One process = one blast radius. Use PM2/ECS restarts + memory limits, and split by `BRANDS` if a brand needs isolating.
