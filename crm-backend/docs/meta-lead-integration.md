# Meta (Facebook) Lead Integration — Adding & Managing Accounts

This guide explains how the CRM pulls leads from Facebook Lead Ads, and the
step-by-step procedure to connect a **new** Facebook account/page (e.g. adding
Gradient alongside The Product Space).

> **Audience:** Superadmins + backend engineers. All UI steps are done in
> **CRM Settings → Facebook Leads** (`/crm-settings/facebook`), which is
> Superadmin-only.

---

## 1. How it works (architecture in one screen)

- Each Facebook **Page** is stored as a **Meta Account** in the CRM (page ID +
  an encrypted page access token + a default product).
- The CRM caches each page's **lead forms** in the DB (`meta_forms`). You map
  every form to a **product** and optional **subsource**.
- A cron **polls** every active form for leads created in the **last 10 minutes**
  every 5 minutes, deduplicates them, and creates CRM leads.
- A separate hourly job (and a manual **Sync forms** button) refreshes the
  cached form list from Facebook.
- A per-form **Backfill** can pull a form's entire lead history on demand.

Tokens are encrypted at rest with AES-256-GCM (`src/utils/crypto.js`) using the
`TOKEN_ENCRYPTION_KEY` env var. The raw token is never returned to the browser.

Relevant code:

| Concern | File |
| --- | --- |
| Service (CRUD, sync, poll, backfill) | `src/services/meta.service.js` |
| HTTP routes (`/api/v1/meta/*`) | `src/routes/meta.routes.js` |
| Cron schedules | `src/cron/meta/cron.js` |
| Models | `src/models/metaaccount.js`, `metaform.js`, `metalead.js`, `metapolllog.js`, `metasettings.js` |

---

## 2. Prerequisites (once per Facebook account/page)

Before you can add a page in the CRM you need:

1. **A Facebook Page** that is running Lead Ads (the page that owns the lead forms).
2. **Admin (or Leads Access) permission** on that Page for the Facebook user who
   will generate the token.
3. **A Meta/Facebook App** (from <https://developers.facebook.com/apps>) that is
   allowed to access the page. You can reuse one app across multiple pages.
4. The following **permissions** granted to the token (scopes):
   - `leads_retrieval` — read the actual lead data (**required**).
   - `pages_show_list` — list the pages the user manages.
   - `pages_read_engagement` — read page + form metadata.
   - `pages_manage_metadata` — recommended (subscriptions/metadata).
   - *(For a System User token you may also see `pages_manage_ads` / `ads_read`.)*

> A page **access token** with `leads_retrieval` is what the CRM needs — not a
> user token and not an app token.

---

## 3. Getting a Page Access Token

There are two supported ways. **Option A (System User token)** is strongly
recommended for production because it does **not expire**. Option B is fine for
testing.

### Option A — System User token (recommended, long-lived / non-expiring)

1. Go to **Meta Business Suite → Business Settings**
   (<https://business.facebook.com/settings>).
2. **Users → System Users → Add** → create a system user (e.g. `crm-leads-bot`),
   role **Admin** or **Employee**.
3. **Assign assets** → assign the **Page** to this system user with **Full
   control** (or at least *Manage leads*).
4. Select the system user → **Generate new token**.
   - Choose your **App**.
   - Token expiration: **Never**.
   - Select scopes: `leads_retrieval`, `pages_show_list`,
     `pages_read_engagement`, `pages_manage_metadata`.
5. **Copy the token** (shown once). ⚠️ This is the **System User token**, which
   behaves like a *user* token — the CRM's endpoints require a **Page** token, so
   you must derive one from it (next step).
6. **Derive the Page access token** from the system user token:

   ```bash
   curl -s "https://graph.facebook.com/v22.0/<PAGE_ID>?fields=access_token&access_token=<SYSTEM_USER_TOKEN>"
   ```

   The response contains the page token:

   ```json
   { "access_token": "EAAG...THIS_IS_THE_PAGE_TOKEN...", "id": "<PAGE_ID>" }
   ```

   Paste **that `access_token`** into the CRM (Section 5) — *not* the system user
   token. Because it's derived from a non-expiring system user token on an
   assigned page, this page token is effectively non-expiring too.

> **Common error:** `(#190) This method must be called with a Page Access Token`
> means you pasted the **system user token** instead of the derived **page
> token** — redo step 6. If `access_token` comes back empty, the page isn't
> assigned to the system user (step 3) or the scopes are missing (step 4).

> System-user tokens are the most reliable because they survive password changes
> and don't expire, so the cron keeps working indefinitely.

### Option B — Long-lived Page token via Graph API Explorer (good for testing)

1. Open the **Graph API Explorer**
   (<https://developers.facebook.com/tools/explorer/>).
2. Select your **App** in the top-right.
3. Click **Generate Access Token**, and grant the scopes listed in Section 2.
   This gives you a **short-lived user token** (~1 hour).
4. **Exchange it for a long-lived user token** (~60 days). In a terminal:

   ```bash
   curl -s "https://graph.facebook.com/v22.0/oauth/access_token\
   ?grant_type=fb_exchange_token\
   &client_id=<APP_ID>\
   &client_secret=<APP_SECRET>\
   &fb_exchange_token=<SHORT_LIVED_USER_TOKEN>"
   ```

   Copy the `access_token` from the response — this is the long-lived **user**
   token.
5. **Get the Page token** (inherits the ~60-day life of the user token):

   ```bash
   curl -s "https://graph.facebook.com/v22.0/me/accounts?access_token=<LONG_LIVED_USER_TOKEN>"
   ```

   Find your page in the `data[]` array and copy its `access_token` (and note the
   `id` — that's your **Page ID**). That page token is what you paste into the CRM.

> **Option B tokens expire (~60 days).** You'll have to repeat this and update the
> token in the CRM before it lapses. Prefer Option A for anything long-running.

---

## 4. Finding the Page ID

You need the numeric **Page ID** when adding the account.

- From the Graph API: `GET /me/accounts` (Option B step 5) returns each page's `id`.
- Or open the Page → **About** / **Page transparency**, or use
  <https://findmyfbid.com>.
- Or Graph API Explorer: `GET /me/accounts?fields=name,id`.

---

## 5. Adding the account in the CRM

1. Go to **CRM Settings → Facebook Leads → Accounts** tab.
2. Click **Add account** and fill in:
   - **Account name** — a friendly label (e.g. `Gradient`).
   - **Facebook Page ID** — the numeric ID from Section 4.
   - **Page access token** — the token from Section 3 (stored encrypted).
   - **Default product** — the product used for any form you haven't mapped
     explicitly. If that product has subsources, a **Default subsource** field
     appears too.
   - **Enabled** — leave checked so the cron polls it.
3. Save.
4. On the account card, click **Validate** — the token badge should turn
   **green (Token valid)**. If it's red, see Troubleshooting (Section 9).

---

## 6. Syncing & mapping forms

1. On the account card (or the **Forms & Mapping** tab), click **Sync forms**.
   This pulls the page's lead forms into the CRM. *(Syncing never creates leads —
   it only caches form metadata.)*
2. Go to **Forms & Mapping**, pick the account, and for each form set:
   - **Product** — leave as *Default* to use the account default, or pick a
     specific product.
   - **Subsource** — optional; options come from the chosen product.
   - **Active** — uncheck to make the cron **skip** that form entirely.
3. Use the **search box** to find forms by name or ID.

> New forms created on Facebook later won't appear until the next hourly sync or
> until you click **Sync forms** again.

---

## 7. Backfilling historical leads

The live poll only looks back **10 minutes**, so use Backfill to import older
leads for a form (e.g. right after adding a new account).

1. **Forms & Mapping** → the form row → **Backfill**.
2. Optionally choose a **From date** (blank = all-time).
3. **Start backfill** — it runs in the background; the row shows live
   `imported/fetched` progress.

Backfill is **idempotent** — already-imported leads are skipped (dedup on the
Facebook lead ID), so re-running is always safe. Map the form's product/subsource
**before** backfilling so the leads route correctly.

> Backfilled leads are created with today's date (the original Facebook date is
> stored in `source_created_at`) and are assigned via the product's manager
> routing — expect a batch of "new today" leads for that manager.

---

## 8. Turning polling on/off

- **Per account:** the **Enabled** toggle on the account card.
- **Globally:** the **Polling On/Off** switch in the top controls bar
  (`meta_settings.poll_enabled`) — takes effect immediately, no restart.
- **Master switch (server):** the `META_CRON_ENABLED` env var. If it's not
  `"true"`, the schedules aren't registered at boot at all.
- **Fetch leads now** / **Sync forms** buttons trigger a run immediately.

---

## 9. Troubleshooting

| Symptom | Cause / Fix |
| --- | --- |
| Token badge **red / invalid**; logs show `Error validating access token` or code `190` | Token expired or revoked. Generate a new token (Section 3), then **Edit** the account and paste it (leave blank to keep existing). Prefer a System User token so it doesn't expire. |
| **Sync forms** returns few/no forms | The token's user lacks access to the page, or missing `pages_show_list` / `leads_retrieval`. Re-check asset assignment and scopes. |
| Leads not appearing | Confirm: account **Enabled**, form **Active** and **mapped**, global **Polling On**, and the lead is within the last 10 min (older ones need a **Backfill**). Check the **Monitoring** tab for errors. |
| Monitoring shows `value too long for type character varying(100)` | A lead field exceeded a column limit. The importer now clamps name/email and skips only the offending lead (logged); the rest import. |
| Leads go to **General Inquiry** unexpectedly | The form's product (or account default) points to a product id that doesn't exist. Map the form to a real product. |
| Backfill stuck on **running** after a server restart | The in-process job was interrupted. Just start the backfill again (dedup keeps it safe). |

### Monitoring & logs

- **CRM:** Facebook Leads → **Monitoring** tab shows per-run fetched / new /
  duplicate / error counts, with a 24h/7d/30d summary and an account filter.
- **Server logs:** per-lead failures are logged as
  `Meta lead <id> failed: <message>`.
- **DB:** `meta_poll_logs` (run history), `meta_leads` (every ingested Facebook
  lead + its raw payload, keyed by unique `meta_lead_id`).

---

## 10. Environment variables

| Var | Purpose |
| --- | --- |
| `META_CRON_ENABLED` | `"true"` to register the poll + sync schedules at boot (master switch). |
| `TOKEN_ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`). Encrypts page tokens at rest. **Required** to add/validate accounts. Do not rotate without re-saving all tokens. |
| `META_PAGE_TOKEN` | **Legacy.** Only read once by the `meta_accounts` migration to seed the original account. New accounts are managed entirely in the UI — you don't need this for additional pages. |

---

## 11. Quick checklist for adding a new page

1. [ ] Page is running Lead Ads and you have admin/leads access.
2. [ ] Generate a **System User page token** with `leads_retrieval` +
       `pages_read_engagement` + `pages_show_list` (Section 3A).
3. [ ] Note the **Page ID** (Section 4).
4. [ ] (If a new product) create the product in **CRM Settings → Products**.
5. [ ] **Facebook Leads → Add account** → paste token, set default product,
       Enable (Section 5).
6. [ ] **Validate** → badge green.
7. [ ] **Sync forms** → map each form's product/subsource, set Active (Section 6).
8. [ ] (Optional) **Backfill** each form to import history (Section 7).
9. [ ] Confirm the **Monitoring** tab shows successful runs.
