# tps-monorepo

Replaces three backends (`gradient-backend`, `tps-next-backend`, `tps-crm-backend`) and three admin frontends (`gradient-admin`, `product-space-admin`, `tps-crm`) with:

- **`apps/backend`** — one codebase, three bootable targets (`BRAND=tps|gradient|crm`), each with its own database. See [`apps/backend/README.md`](apps/backend/README.md).
- **`apps/admin`** — one Next.js app, one login, one permission system, an internal workspace switcher (Gradient / TPS / CRM). See [`apps/admin/src/lib/workspace.ts`](apps/admin/src/lib/workspace.ts).

Full design rationale, the audit this was built from, and the phased migration plan: [`BACKEND-CONSOLIDATION-PLAN.md`](../BACKEND-CONSOLIDATION-PLAN.md) (one level up, alongside the original six source projects).

Public sites (`gradient-next-ui`, `product-space-next-ui`) are **not** part of this monorepo — they're customer-facing, brand-specific, and keep talking to whichever backend target serves their brand (`api.gradientlearnings.org` → `BRAND=gradient`, `api.theproductspace.in` → `BRAND=tps`, `crm-api.theproductspace.in` → `BRAND=crm`, same as today).

## What's real here vs. what's follow-up

This was built by copying the actual source of all six original projects, rewriting their imports/auth/routing to the unified shape, and verifying with a real `npm install` + `tsc --noEmit` pass on the admin app (0 install errors, 20 pre-existing type errors — all confined to one documented dependency conflict, see below). It is not a scaffold of empty folders.

**Done:**
- Backend `BRAND` dispatcher, cascading three-way install, each target's own DB connection untouched.
- Shared admin identity (`users` + `admin_workspace_grants` in `crm_db`) — one login, JWT carries per-workspace grants.
- TPS and Gradient backends both verify CRM-issued JWTs directly and JIT-provision their local identity row (`company` / `AdminUser`) so existing foreign keys don't need a data migration.
- Cross-database grant backfill script (`apps/backend/scripts/backfill-workspace-grants.js`) — **must be run before cutover**, see `apps/backend/README.md`.
- `unified-admin`: TPS's `admin`/`superadmin` route trees collapsed into one role-gated tree; Gradient's ~330 files ported in with every import rewritten to a `@/gradient/*` namespace; a workspace switcher wired into both; middleware gates all three route trees by actual grant, not just "logged in."
- CRM workspace: one real page ported end-to-end (Dashboard, with all its charts/KPI widgets) proving the pattern — calls the CRM backend through the same unified auth as everything else.

**Follow-up work, not done here:**
- **CRM workspace, the rest of it** — tps-crm is a Vite + react-router SPA (264 files); Dashboard is ported, the other ~9 pages (Boards, Leads, Enrollments, Payments, Invoices, Student Profiles, Meetings, Reports, Settings) are still Vite-only. This was always meant to be the last, biggest phase (see the consolidation plan §7.4) — budget it as its own piece of work, not a quick follow-up.
- **Tiptap v2 vs v3**: `product-space-admin` runs Tiptap v2, `gradient-admin` runs Tiptap v3 with v3-only extensions (`@tiptap/html`, `@tiptap/extensions`, `@tiptap/extension-table-of-contents`). Kept at v2 (the base app's version) rather than risk a silent break elsewhere — Gradient's `TiptapEditor`, `RichTextEditor`, and docx-import components (20 type errors, all in these 3 files) need a real compatibility pass before they'll compile.
- **Google OAuth admin login** isn't unified — it's still TPS-only (`services/auth/authService.ts`'s `loginWithGoogle`/`signup*`). The CRM backend has no Google-login or invite-flow route yet.
- **Page-level role enforcement** beyond nav visibility: sidebar items are hidden by role (Superadmin-only sections, etc.), but direct navigation to a URL isn't blocked per-page yet — only per-workspace (middleware.ts).
