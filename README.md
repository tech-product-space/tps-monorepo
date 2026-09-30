# ps-v3

Consolidated project for the 3 backend services, pulled fresh from `main` on 2026-09-30, targeting a single EC2 (`t4g.medium`) with a local PostgreSQL instance — no RDS, one database, one schema per service.

## Layout

```
ps-v3/
├── tps-backend/       ← tech-product-space/tps-next-backend, main @ c04b9d5
├── crm-backend/        ← tech-product-space/tps-crm-backend,  main @ a82c4c1 (already up to date)
├── gradient-backend/    ← tech-product-space/gradient-backend, main @ 4253fee
└── db/init.sql          ← creates `productspace` DB, 3 schemas, ps_app role — run once on the server
```

`node_modules` was stripped from all 3 copies — reinstall fresh on the EC2 (target is arm64/t4g, your local `node_modules` wouldn't be portable anyway).

## Database: 1 instance, 1 database, 3 schemas

Per your decision: each service keeps its own existing tables/auth as-is, just namespaced into its own schema (`tps`, `crm`, `gradient`) instead of a separate database. `db/init.sql` creates the DB, schemas, and a single `ps_app` role with grants on all three. The unified-login/shared-auth schema is **explicitly deferred** — not part of this pass.

## What each service still needs before this works — not yet done

None of the 3 backends currently set a schema on their DB connection (all default to Postgres's `public` schema), and all 3 require SSL on the DB connection (correct for RDS, wrong for a local Postgres on `localhost`). Concretely:

| Service | File(s) | Change needed |
|---|---|---|
| `tps-backend` | `config/db.js` | Add `define: { schema: 'tps' }` to the Sequelize options; make `dialectOptions.ssl` conditional (off for local) |
| `crm-backend` | `src/config/database.js` | Add `schema: 'crm'` per environment block; same SSL toggle |
| `gradient-backend` | `src/database/postgres/sequelize.js`, `src/database/postgres/config.js` | Add `define: { schema: 'gradient' }` in both (CLI config controls where migrations land); same SSL toggle |

I stopped short of making these edits in this pass — they touch each service's core DB connection layer and I wanted to flag them rather than push a change to 3 codebases unreviewed. Say the word and I'll make all three.

## ⚠️ New finding — not in any earlier sizing estimate

`gradient-backend` requires **Redis** (BullMQ, for workflow automation — `npm run worker` is a **second, separate Node process** from the main API, `src/worker.js`) and expects it via a Docker container in dev (`npm run redis:up`). This is a real infra dependency that wasn't accounted for in the `t4g.medium` sizing discussion so far — the box now needs to run:

- 3 API processes (tps, crm, gradient)
- 1 worker process (gradient's BullMQ worker)
- Postgres
- Redis

That's meaningfully more than the "3 Node processes + Postgres" estimate the sizing conversation was based on. Worth re-checking whether `t4g.medium` (4GB) is still enough, or whether `t4g.large` (8GB, already the leaning recommendation for headroom) becomes the safer floor rather than just "nice to have." Also: Agenda (used by `tps-backend` and `gradient-backend` for scheduled jobs) runs on Postgres directly, not Redis — no extra service there.

## Still pending

- SSH access to the EC2 once it exists, to run `db/init.sql`, install Postgres 17.9 + Redis, and do the schema-wiring config edits above
- `.env` files for all 3 services (not copied — check each repo's `.env.example`)
- nginx config + domain routing for 3 services on one box
- Backup cron (`pg_dump` → S3), CloudWatch agent, EC2 auto-recovery — as previously discussed
