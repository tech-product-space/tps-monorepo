# Facebook (Meta) Lead Ads — operator guide

How Gradient imports leads from Facebook Lead Ad forms, and how to connect a
page, map its forms, and fix it when it breaks.

**Audience:** Super Admins and backend engineers.
All UI steps are in **Integrations → Facebook** (`/integrations/facebook`),
which is Super Admin only. The leads themselves are in **Leads → Meta Leads**
(`/leads/meta`), which any admin can open.

---

## 1. How it works, in one screen

- Each Facebook **Page** is a **meta_accounts** row: page ID, an encrypted page
  token, and default routing.
- Sources and sub sources are a managed catalogue in **meta_sources**, edited
  from the Meta Leads screen. Nothing is typed free-hand.
- The page's **lead forms** are cached in **meta_forms**. Each form *picks* a
  source, sub source and optionally a course from that catalogue.
- A job **polls every 5 minutes**, asking each active form for leads created in
  the **last 10 minutes**, and writes them to **meta_leads**.
- A separate **hourly sync** (and the *Sync forms* button) refreshes the cached
  form list.
- A per-form **Backfill** imports a form's entire history on demand.

**Facebook leads do not go into the `leads` table.** They are their own table
with their own screen. Nothing about the website leads pipeline changed.

Tokens are AES-256-GCM encrypted at rest (`util/tokenCrypto.js`) using
`TOKEN_ENCRYPTION_KEY`. **The raw token is never returned to the browser.**

| Concern | File |
|---|---|
| Graph client, error parsing | `services/meta/graphClient.js` |
| Accounts, token validation, form sync | `services/meta/metaAccount.service.js` |
| Import, poll, backfill | `services/meta/metaIngestion.service.js` |
| Runtime polling switch | `services/meta/metaSettings.service.js` |
| Token-expiry alert | `services/meta/metaAlert.service.js` |
| Jobs | `jobs/metaPollJob.js`, `metaFormSyncJob.js`, `metaBackfillJob.js` |
| HTTP (`/meta/*`) | `routes/meta/meta.route.js` |
| Source catalogue | `controllers/meta/source.controller.js` |
| Models | `database/postgres/models/meta*.model.js` |

---

## 2. Two numbers people misread

Worth reading before the monitoring tab confuses somebody.

**"Already had" is not a problem.** The poll runs every 5 minutes and asks for
the last 10, so it deliberately sees every lead twice. The unique index on
`metaLeadId` absorbs the repeat. A healthy system shows a large "Already had"
count. It means the safety overlap is working — one slow or failed run cannot
drop a lead, because the next run re-covers its window.

**"Already had" is not the `duplicate` status.** They are different questions:

| | Means | Creates a row? |
|---|---|---|
| **Already had** (log counter) | We had already imported this *Facebook lead* | No |
| **Duplicate** (lead status) | This *person* filled a second form | Yes |

Facebook issues a new lead id for every submission, so the same person filling
two forms is two rows with two ids — both kept, the second flagged `duplicate`.

The counts on a run always add up: `fetched = new + already had + no contact + failed`.

---

## 3. Prerequisites, once per page

1. A **Facebook Page** running Lead Ads.
2. **Admin** or **Leads Access** on that page for whoever generates the token.
3. A **Meta app** (<https://developers.facebook.com/apps>). One app can serve
   several pages.
4. These scopes on the token:
   - `leads_retrieval` — read the lead data (**required**)
   - `pages_show_list` — list managed pages
   - `pages_read_engagement` — read page and form metadata
   - `pages_manage_metadata` — recommended

---

## 4. Getting a page access token

**Use Option A.** Option B expires in ~60 days and will silently stop ingestion
on whatever day that falls.

### Option A — System User token (never expires) ✅

1. **Meta Business Suite → Business Settings**
   (<https://business.facebook.com/settings>).
2. **Users → System Users → Add** — e.g. `gradient-leads-bot`, role Admin or
   Employee.
3. **Assign assets** → assign the **Page** with **Full control** (or at least
   *Manage leads*).
4. Select the system user → **Generate new token**:
   - Choose your app
   - Expiration: **Never**
   - Scopes: the four in §3
5. Copy it. ⚠️ **This is a system user token, not a page token.** Gradient needs
   a *page* token — derive one:

   ```bash
   curl -s "https://graph.facebook.com/v22.0/<PAGE_ID>?fields=access_token&access_token=<SYSTEM_USER_TOKEN>"
   ```

   ```json
   { "access_token": "EAAG…THIS_IS_THE_PAGE_TOKEN…", "id": "<PAGE_ID>" }
   ```

   Paste **that** `access_token` into Gradient. Because it derives from a
   non-expiring system user token on an assigned page, it does not expire
   either.

> **If `access_token` comes back empty**, the page is not assigned to the system
> user (step 3), or the scopes are missing (step 4).

### Option B — Graph API Explorer (testing only)

1. <https://developers.facebook.com/tools/explorer/>, select your app.
2. **Generate Access Token** with the §3 scopes → a ~1 hour user token.
3. Exchange for a long-lived (~60 day) user token:

   ```bash
   curl -s "https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<SHORT_LIVED_TOKEN>"
   ```

4. Get the page token (and the page ID) from it:

   ```bash
   curl -s "https://graph.facebook.com/v22.0/me/accounts?access_token=<LONG_LIVED_USER_TOKEN>"
   ```

> **These expire in ~60 days.** You will have to repeat this before they lapse.

---

## 5. Finding the Page ID

- `GET /me/accounts?fields=name,id` in the Graph API Explorer, or
- the page's **About** / **Page transparency** section.

---

## 6. Connecting the page

1. **Integrations → Facebook → Accounts → Connect a page**.
2. Fill in:
   - **Account name** — a label, e.g. `Gradient Learnings`
   - **Facebook Page ID** — from §5
   - **Page access token** — from §4 (stored encrypted)
   - **Default routing** — source / sub source used by any form you have not
     mapped individually
   - **Enabled** — leave on
3. Save, then click **Validate**. The badge should turn green.
4. Click **Sync forms** to pull the page's lead forms in.

---

## 7. Sources, and mapping forms

### 7a. Where sources come from

Sources and sub sources are a managed list. Nothing anywhere accepts one typed
free-hand — every other screen *picks* from this list.

That is the whole point: routing is frozen onto each lead at import, so a typo
in a free-text field would be permanent for every lead that arrived under it —
and `facebook`, `Facebook` and `fb` would become three sources no filter could
reconcile.

There are three ways in, all editing the same catalogue:

| Where | What you get |
| --- | --- |
| **Leads → Meta Leads → Manage sources** | The full catalogue — add, rename, retire, delete |
| **Integrations → Facebook → Forms & Mapping → Manage sources** | The same dialog, without leaving the mapping screen |
| The **Add a source** / **Add a sub source** item at the bottom of either dropdown in Forms & Mapping | Adds one entry and drops it straight into the row you were mapping |

Use the dropdown shortcut while mapping — it is there because *"the source I
need isn't in the list"* is the one thing that interrupts the job, and leaving
the screen to fix it would discard every unsaved row.

- The **key** (`mba-bootcamp`) is generated from the name and is what gets
  recorded on each lead. It **cannot be changed later**; the display name can.
  The quick-add dialog shows you the key before you save for exactly that
  reason.
- **Retire** rather than delete when something is no longer used. Retiring hides
  it from the pickers while leaving historical leads readable.
- Deleting is refused while any form, page default or imported lead still
  references it — the error says exactly what is still pointing at it.

### 7b. Map the forms

**Integrations → Facebook → Forms & Mapping** → pick the page. The forms are a
table, one row each: choose a **Source**, optionally a **Sub source** and
**Course ID**, tick **Active**, and **Save** appears on that row once you have
changed something.

- Sub sources are scoped to their source, so the second dropdown only offers
  children of the first — and stays disabled until a source is picked, since
  there would be nothing to scope to. Changing the source clears the sub source.
- **Active off** → the poll skips that form entirely.
- Forms with no mapping are counted in a note above the table and tagged
  **Not mapped** in their row; they fall back to the page defaults.
- Sync never overwrites your mapping — it only refreshes names and status.

> **Routing is frozen onto each lead when it arrives.** Remapping a form changes
> where *future* leads are attributed, not past ones. That is deliberate: a
> remap silently rewriting six months of history would be worse.

### 7c. Changing a mapping that already has leads

Save a routing change on a form that has already imported leads and the panel
stops to ask what to do about them. It only asks when the answer matters — a
form with no leads, or an edit that only toggled **Active**, saves straight
through.

| Choice | Effect |
| --- | --- |
| **Future leads only** | The leads already imported keep the source they arrived under. Only new ones use the new mapping. |
| **Update all N** | Rewrites the source, sub source and course on every lead this form has imported. |

Prefer **Future leads only**. It is the reversible choice — you can always come
back and re-attribute later, but you cannot recover the old values once they are
overwritten. Reach for **Update all** when the original mapping was simply
*wrong* (a form pointed at the wrong programme from day one), not when the
taxonomy has legitimately changed — in the second case the old leads really did
come from the old source, and rewriting them makes the history a lie.

Re-attribution is recorded in the activity log with the row count, so
"changed a mapping" and "rewrote the attribution of 98 leads" do not read the
same afterwards.

---

## 8. Backfilling history

The poll only looks back 10 minutes, so a newly connected page needs its history
imported.

**Forms & Mapping** → the form → **Backfill** → optionally a **From date**
(blank = everything) → **Start backfill**. Progress updates live on the row.

- **Safe to re-run.** Dedupe is on Facebook's lead id, so a retry after a crash
  imports nothing twice.
- **Map the form first.** The button is disabled on an unmapped form, because
  routing is frozen at import.
- Backfilled leads keep their **original Facebook date**, so they land at the
  right point in the list rather than all dated today.
- A backfill interrupted by a restart is reclaimed after an hour — just start it
  again.

---

## 9. Turning it off

| Scope | Where | Effect |
|---|---|---|
| One page | **Enabled** toggle on the account card | Poll skips that page |
| One form | **Active** checkbox | Poll skips that form |
| Everything, now | **Polling** switch, Monitoring tab | Takes effect immediately, no restart |
| Everything, at deploy | `META_INTEGRATION_ENABLED` env | Jobs are never scheduled at all |

The Monitoring switch is the one to reach for at 11pm. The env var is the one
for a deploy that should not poll at all.

---

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Badge **red**, error mentions code `190` | Token expired or revoked. Generate a new one (§4A) and paste it into **Edit** — blank keeps the existing token, so you must actually type the new one. |
| `(#190) This method must be called with a Page Access Token` | You pasted the **system user** token. Derive the page token — §4A step 5. |
| **Sync forms** returns nothing | The token's user cannot see the page, or `pages_show_list` / `leads_retrieval` are missing. Re-check asset assignment and scopes. |
| No leads appearing | Check, in order: account **Enabled**, form **Active**, global **Polling** on, and that the lead is under 10 minutes old. Anything older needs a **Backfill**. |
| Leads appear with the wrong source | The form was unmapped when they arrived. Routing is frozen at import — fix the mapping for future leads; past ones need a data fix. |
| Lots of **No contact** leads | The Facebook form collects neither email nor phone. That is a form configuration problem in Meta, not an import bug. |
| Backfill stuck on **running** | It is reclaimed automatically after an hour. Start it again — re-running is always safe. |
| "TOKEN_ENCRYPTION_KEY is not configured" | The env var is missing or not 64 hex chars. No account can be read or saved until it is set. |

### Where to look

- **Panel:** Integrations → Facebook → **Monitoring** — tiles over 24h/7d/30d, plus the
  per-run log filterable by page. Untick *Hide empty runs* to see every cycle.
- **Server logs:** `Meta lead import failed`, `Meta poll complete`,
  `Meta backfill complete`.
- **Database:** `meta_poll_logs` (run history), `meta_leads.rawPayload` (exactly
  what Facebook sent, per lead).

---

## 11. Environment variables

| Var | Purpose |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`). **Required.** Encrypts page tokens. Rotating it invalidates every stored token — they must all be re-entered. Set it **before** running the migrations. |
| `META_INTEGRATION_ENABLED` | `"true"` schedules the poll and sync jobs at boot. |
| `META_GRAPH_VERSION` | Defaults to `v22.0`. |
| `META_ALERT_EMAIL` | Where the token-expiry alert goes. Unset disables the alert. |
| `ADMIN_SITE_URL` | Used for the link in that alert email. |

Note `AGENDA_JOBS_ENABLED` must also be `"true"` — the meta jobs run on Agenda
like every other scheduled job here.

---

## 12. Checklist for a new page

1. [ ] Page is running Lead Ads and you have admin/leads access
2. [ ] `TOKEN_ENCRYPTION_KEY` is set on the server
3. [ ] Generate a **System User page token** (§4A) — including the derive step
4. [ ] Note the **Page ID** (§5)
5. [ ] **Connect a page** with default routing (§6)
6. [ ] **Validate** → badge green
7. [ ] **Sync forms** → map each form, set Active (§7)
8. [ ] **Backfill** each form you want history for (§8)
9. [ ] Confirm **Monitoring** shows successful runs
10. [ ] Submit a test lead on a live form and confirm it appears in **Meta Leads**
    within 5 minutes
