# Email Templates — plan

Status: **Phase 1 built** (campaigns + workflows) · 8 Oct 2026 · repos: `tps-backend`, `product-space-admin`

## 1. What we want

1. A new **Email Templates** page in the admin sidebar. An admin pastes or uploads a full HTML email (like `event-invite-email.html`) and saves it under a name, e.g. "Campaign template 1".
2. Wherever an email body is written — campaigns and workflow email steps first — the admin can **choose a template**. The template opens in place and can be edited: text, links, button text and URL, button colour, images.
3. An email built from a template is sent **as-is**, not wrapped in the default grey-background/white-card layout.

## 2. How it works today (what this plan has to fit into)

| Piece | Where | Notes |
|---|---|---|
| Body editor | `product-space-admin/src/components/Rich-Text-Editor/EmailTextEditor3.tsx` | **Not Tiptap.** A `contentEditable` `<div>` driven by `document.execCommand`; the value is a raw HTML string. Used in 9 places. |
| Campaign body | `Campaign.content` (TEXT) | Edited in `CampaignEditPage.tsx`. |
| Workflow body | node config `html_body` | Edited in `workflows/editor/NodeConfigSheet.tsx`, which also runs a client-side `cleanHtml` on save (line ~278). |
| Default layout | `tps-backend/utils/email/htmlHelpers.js` | `wrapEmailTemplate` (no footer) and `wrapEmailTemplateWithUnsubscribe` (footer + unsubscribe link). |
| Campaign send | `jobs/campaignScheduler.js` ~L160–180 | `cleanHtml` → `replacePlaceholders({name})` → wrapper picked by sender address. |
| Campaign test | `controllers/campaign/campaign.controller.js` `sendTestMail` | Same, always `wrapEmailTemplate`. |
| Workflow send | `service/workflow/dispatchers/emailDispatcher.js` ~L60–110 | `cleanHtml` → `\n`→`<br>` → click-tracking rewrite → wrapper. |
| Workflow test | `controllers/workflow/workflow.controller.js` ~L645 | Same, no tracking. |
| Placeholders | campaign: `replacePlaceholders` (`{{name}}` only) · workflow: `interpolate` (`{{name}}`, `{{email}}`, `{{phone}}`, legacy `{{lead.*}}`) | Two different functions with different vocabularies. |

### Why "just skip the wrapper" is not enough

A full HTML template would be **damaged** by the current send pipeline, not just double-wrapped:

- `cleanHtml` rewrites every `<p>` to `<div>` and replaces every `font-family` — the template's typography breaks.
- `\n → <br>` (both `replacePlaceholders` and the workflow path) inserts `<br>` between every line of the source, including between `<tr>`s, which breaks table layouts in Outlook and Gmail.
- `EmailTextEditor3` cannot hold a full document: setting `innerHTML` on a `<div>` drops `<html>/<head>`, and the template's `<style>` block would **apply to the whole admin page**.

So templates need their own **editor** and their own **send path**. The plain editor and its pipeline stay exactly as they are.

## 3. Key decisions

### 3.1 Copy, don't link
When a template is chosen, its HTML is **copied** into the campaign/workflow step. Later edits to the library template do **not** change campaigns already written, scheduled or running. A campaign/step keeps a `template_id` only to show where it came from.
*Why:* a workflow can send for months; editing "Campaign template 1" for next week's launch must not silently change what a live workflow sends today.

### 3.2 A "body mode" per email
Every email body gets a mode:

| Mode | Editor | Send pipeline | Wrapper |
|---|---|---|---|
| `editor` (default, all existing rows) | `EmailTextEditor3` | unchanged | default layout |
| `template` | new `TemplateEmailEditor` | new `renderTemplateEmail` | **none** |

Switching from template back to plain editor asks for confirmation, because the template layout is lost.

### 3.3 Edit the content, lock the layout
Free-form `contentEditable` on a table-based email is how layouts get destroyed: one Backspace in the wrong cell deletes a `<td>`. The template editor makes **content** editable and keeps **structure** locked:

| Element | How it's edited |
|---|---|
| Text blocks (`p`, `h1`–`h4`, `li`, `span`/`div`/`td` that contain only text and inline formatting) | Inline, in place. Bold/italic/underline/link/colour toolbar. Enter inside a block adds `<br>`, never a new table cell. |
| Links (`<a>`) | Click → popover: text, URL. |
| Buttons — an `<a>` inside a `td[bgcolor]`, or an `<a>` with padding + background | Click → popover: text, URL, background colour, text colour. Background is written to **both** the `td`'s `bgcolor` and its style, and to the `<a>`, so Outlook and Gmail agree. |
| Images | Click → popover: replace (upload), alt text, link URL, width. |
| Tables, rows, cells, spacing | Not editable inline. |
| Everything else | "Edit HTML" tab (code view) for the cases above doesn't cover. |

Bonus actions: **duplicate a block** and **delete a block**, where a block is a top-level `<tr>` of the main container. That covers "remove the WhatsApp strip" or "add a fourth reward row" without touching HTML.

### 3.4 The editor runs inside a sandboxed iframe
The template is rendered with `<iframe srcdoc>` and edited inside the iframe's document. Its `<style>` and media queries apply only to the email, never to the admin. This is also what makes the mobile preview possible: same iframe at 375px wide.

### 3.5 Placeholders: three kinds
`{{...}}` in a template means one of three things. The system tells them apart by name:

| Kind | Examples | Filled when | By |
|---|---|---|---|
| **Recipient** | `{{name}}`, `{{first_name}}`, `{{email}}`, `{{phone}}` | Per recipient, at send | Backend |
| **System** | `{{unsubscribe_url}}`, `{{website_url}}` | At send | Backend |
| **Template field** | `{{event_title}}`, `{{event_date}}`, `{{register_url}}`, `{{whatsapp_url}}`, `{{dashboard_url}}` | **When the template is applied** | Admin, in a "Fill in fields" panel |

When the admin picks a template, the editor lists the template fields found in it ("Event title", "Register URL", …) and writes the values into the copied HTML. Values are HTML-escaped; URLs are checked to be `http(s)`/`mailto`.
**Sending is blocked** while any `{{...}}` other than recipient or system placeholders remain. Otherwise the recipient gets an empty title or a dead button.

One shared function replaces the two existing ones for template mode, `fillPlaceholders(html, values, { escape: true })`. It supports the flat names above and the legacy `{{lead.*}}`. `{{first_name}}` is new: the first word of `name`, capitalised the same way `capitalizeName` does for campaigns.

### 3.6 Unsubscribe is not optional
Today the sender address decides whether the footer and unsubscribe link are added. Gradient senders get no footer; everyone else does. In template mode:

- If the template contains `{{unsubscribe_url}}`, it is filled in. The example template does this in its own footer.
- If it does not, and the sender is one that gets an unsubscribe link today, a minimal footer (one line plus the link) is **injected before `</body>`**. The template looks almost unchanged, and marketing mail still has an unsubscribe link.
- The `List-Unsubscribe` headers the workflow dispatcher already sets stay the same in both modes.
- On the template page, a template without `{{unsubscribe_url}}` shows a warning, not an error.

## 4. Data model (`tps-backend`)

The name `EmailTemplate` is **already taken** (`models/emailtemplate.js` → table `EmailTemplates`, per-event email bodies), so the new model gets another name.

### 4.1 New model `EmailLibraryTemplate` → table `email_library_templates`

| Column | Type | Notes |
|---|---|---|
| `id` | STRING, ULID | Same as `Campaign`. |
| `name` | STRING, unique among non-archived | "Campaign template 1". |
| `description` | TEXT, null | |
| `html` | TEXT | Full document, sanitised on save (§4.3). |
| `fields` | JSONB | Detected template fields, e.g. `[{ key: "register_url", label: "Register URL", type: "url" }]`. Recomputed on save. Labels can be edited. |
| `preheader` | TEXT, null | Extracted from the hidden preheader div if present; editable. |
| `size_bytes` | INTEGER | For the Gmail-clipping warning (§4.3). |
| `is_archived` | BOOLEAN, default false | Archive, not delete: campaigns keep a `template_id`. |
| `created_by`, `updated_by` | STRING, null | Admin ids. |
| `created_at`, `updated_at` | | |

### 4.2 New columns

- `campaigns.content_mode` STRING, default `'editor'`, and `campaigns.template_id` STRING, null.
- Workflow email node config, which is JSON, so no migration: `body_mode` (`'editor'` | `'template'`, missing = `'editor'`) and `template_id`. `html_body` holds whichever body is active.

Existing rows need no backfill: missing or default values mean `editor`, which is today's behaviour.

### 4.3 Validation on save (server-side; the client checks the same things for fast feedback)

- **Sanitise:** remove `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `on*=` attributes, and `javascript:` URLs. Keep `<style>`, `<head>`, MSO conditional comments and `bgcolor`/`width` attributes, which email needs.
- **Images:** any `<img src>` that isn't an absolute `https://` URL is refused with the list of offending files. The example's `logo.png` would be caught. The upload flow fixes it (§5.2).
- **Size:** warn above **90 KB**. Gmail clips messages over ~102 KB and hides the rest, including the unsubscribe link.
- **Fields:** re-detect `{{...}}` and classify each per §3.5.

### 4.4 API — `routes/emailLibraryTemplateRoutes.js`, mounted with the same auth as `campaignRoutes`

```
GET    /email-templates                list (name, updated_at, size, field count, usage count); ?archived=
GET    /email-templates/:id            one, with html
POST   /email-templates                create { name, description, html }
PATCH  /email-templates/:id            update
POST   /email-templates/:id/duplicate
PATCH  /email-templates/:id/archive    archive / unarchive
POST   /email-templates/:id/send-test  { email } — fills recipient fields with sample values
GET    /email-templates/:id/usage      campaigns + workflow steps whose template_id points here
```

### 4.5 Send path — `utils/email/htmlHelpers.js`

Add one entry point and use it at the four send sites, so the branching lives in one place:

```js
renderEmailBody({
  html, mode,                // 'editor' | 'template'
  recipient,                 // { name, email, phone }
  unsubscribeUrl,            // null when this sender gets none
  trackLinks,                // optional (html) => html, for the workflow click-tracker
})
```

- **`editor`:** exactly today's steps, moved in unchanged: `cleanHtml` → placeholders (with `\n`→`<br>`) → tracking → wrapper.
- **`template`:** fill recipient placeholders (escaped, **no** `cleanHtml`, **no** `\n`→`<br>`) → `trackLinks` while `{{unsubscribe_url}}` is still literal, so the unsubscribe link is never click-tracked (the same guarantee the wrapper gives today) → fill `{{unsubscribe_url}}`, or inject the minimal footer (§3.6) → return the document unwrapped.

Call sites to switch:

1. `jobs/campaignScheduler.js` (real campaign send)
2. `controllers/campaign/campaign.controller.js#sendTestMail`
3. `service/workflow/dispatchers/emailDispatcher.js` (real workflow send)
4. `controllers/workflow/workflow.controller.js` test send (~L645)

Also update the client-side `cleanHtml` in `NodeConfigSheet.tsx` and `workflows/editor/utils.ts`: skip it when `body_mode === 'template'`.

## 5. Admin UI (`product-space-admin`)

### 5.1 Sidebar and routes
Add **Email Templates** under **Marketing**, after Campaigns, in both `AdminSidebar.tsx` and `SuperAdminSidebar.tsx`:

```
/admin/marketing/email-templates           list
/admin/marketing/email-templates/new       create
/admin/marketing/email-templates/[id]      view / edit
(+ the same under /superadmin)
```

Page components go in `components/Pages/Common/emailTemplates/`, shared by both trees like campaigns.

### 5.2 List page
A grid of cards. Each card shows a scaled-down live preview (iframe at 600px, CSS-scaled), the name, last edited date, and "Used in N". Each card has actions: Open, Duplicate, Send test, Archive. Search by name, plus an "Archived" toggle.

### 5.3 Create flow
1. **Name** + **Upload `.html`** or **Paste HTML**.
2. **Check step**, shown before saving:
   - **Images:** each relative image (`logo.png`) gets an **Upload** button. It uses the existing upload endpoint (`fileUploadRoutes`) and rewrites the `src` to the returned URL.
   - **Fields:** the detected fields with editable labels ("register_url" → "Register URL") and a type (text / URL / date).
   - **Warnings:** missing `{{unsubscribe_url}}`, size above 90 KB, anything removed by sanitising.
3. **Save** → opens the template in the editor.

### 5.4 Template detail page
- **Edit:** `TemplateEmailEditor` (§5.5). Template fields are shown as **highlighted chips**, not filled in, because this is the master.
- **Preview:** Desktop (600px) / Mobile (375px) toggle, rendered with sample values.
- **Code:** HTML source editor. A monospace `<textarea>` in Phase 1; there is no code-editor dependency in this app today, so CodeMirror would be a new one.
- **Fields, Send test, Duplicate, Archive, Used in** (links to campaigns and workflows).

### 5.5 `TemplateEmailEditor` — new component
`components/Rich-Text-Editor/TemplateEmailEditor.tsx`, with props `{ value: string; onChange(html: string): void; fields?: FieldDef[] }`.

- Renders `value` into an `<iframe srcdoc>`, plus a small injected stylesheet for hover outlines and selection, which is removed again on serialise.
- On load, it walks the iframe DOM and tags elements per §3.3 with `data-tpl-edit="text|link|button|image"`. It sets `contenteditable` only on `text` elements. Tags are added in memory and stripped on serialise, so the saved HTML stays clean.
- Floating toolbar for text: B / I / U / link / colour. Popovers for link, button and image. Hover "⋯" on top-level rows: duplicate / delete.
- Serialise: `<!DOCTYPE html>` + `documentElement.outerHTML`, minus editor-only attributes and styles. `onChange` is debounced (~300ms).
- Undo/redo: snapshots of the serialised HTML on each committed change. `execCommand` undo doesn't span iframe DOM swaps.
- Paste inside a text block: plain text only, so pasted Word or Google Docs markup can't break the table.

### 5.6 `EmailBodyField` — the switch used by campaign and workflow
`components/Rich-Text-Editor/EmailBodyField.tsx` wraps both editors:

```
┌ Email body ──────────────────────── [ Use a template ▾ ] ┐
│  (EmailTextEditor3  — or —  TemplateEmailEditor)         │
└──────────────────────────────────────────────────────────┘
```

- **Use a template** opens a picker dialog: the same cards as the list page, plus a large preview of the selected one.
- **Choosing one:**
  - If the current body isn't empty, confirm first: "Replace the current email body?"
  - Open the **Fill in fields** panel: Event title, Date, Register URL, … Values can be edited later from the editor's **Fields** button, until sending.
  - Copy the HTML with the values filled in, set `mode = 'template'` and `template_id`, and show `TemplateEmailEditor`.
- **In template mode** the header shows "From template: *Campaign template 1*", plus two actions:
  - **Change template** (same confirm as choosing one).
  - **Switch to plain editor** — confirms, then clears the body.
- **Props:** `{ value, mode, templateId, onChange({ html, mode, templateId }) }`.

### 5.7 Integration
**Phase 1 (this request):**

- `CampaignEditPage.tsx`: replace `EmailTextEditor3` with `EmailBodyField`. Persist `content_mode` / `template_id` alongside `content`. The copy/paste-content feature (localStorage `ps_copied_campaign_content`) should carry the mode too.
- `NodeConfigSheet.tsx`: same, persisting `body_mode` / `template_id` in the node config. Copy/paste between nodes carries the mode.
- **Campaign preview page** (`campaigns/Preview/PreviewPage.tsx`) and the workflow preview render via a new `POST /email-templates/render-preview` (or a mode-aware campaign preview) in a sandboxed iframe, so the preview shows exactly what `renderEmailBody` sends.
- **Send-blocking check:** campaign "Send/Schedule" and workflow "Activate" refuse while unfilled template fields remain, naming them.

**Phase 2 (the other 7 `EmailTextEditor3` uses):** event reminders (`ReminderEmailV2`), event enrolment (`EmailBodyBox`), certificate emails (event + course), cohort enrolment and curriculum download, resource email template, newsletter. Each needs the same `mode` field on its row and the same `renderEmailBody` switch at its send site, all of which call `wrapEmailTemplate` today (see the call-site list from `grep wrapEmailTemplate`). Do these one at a time after Phase 1 has been used for real. Each is small once the shared pieces exist.

## 6. Build order

| # | Step | Repo | Size |
|---|---|---|---|
| 1 | Model + migration + CRUD routes + sanitise/validate | backend | M |
| 2 | `fillPlaceholders` + `renderEmailBody` + unit-style script in `sandbox/` comparing old vs new output for `editor` mode (must be byte-identical) | backend | M |
| 3 | Switch the 4 send sites to `renderEmailBody`; add `content_mode`/`template_id` to campaigns | backend | S |
| 4 | Sidebar + list + create flow (upload, image fix-up, fields) | admin | M |
| 5 | `TemplateEmailEditor` (iframe, tagging, popovers, serialise, undo) | admin | **L** — the risky part |
| 6 | Template detail page (edit / preview / code / test) | admin | S |
| 7 | `EmailBodyField` + picker + fill-in-fields panel | admin | M |
| 8 | Wire into campaigns and workflows, previews, send-blocking checks | admin | M |
| 9 | Test matrix (§7) | both | M |
| 10 | Phase 2 surfaces, one by one | both | S each |

Steps 1–3 can ship before any UI. They change nothing for existing emails, and step 2's comparison script is what proves that.

## 7. Testing

- **No regression:** for a sample of existing campaign and workflow bodies, `renderEmailBody({ mode: 'editor' })` output equals the current pipeline's output exactly.
- **Round trip:** import `event-invite-email.html` → open → edit nothing → serialise. The result has the same DOM (whitespace aside), and the `<style>`, MSO comments and preheader survive.
- **Edits:** change a heading, a button's text, URL and colour, and an image. Only those nodes differ in the output.
- **Client rendering:** send tests to Gmail (web + Android), Outlook (desktop + web) and Apple Mail. Check the bulletproof button colour, the mobile stacking of the date/time/format row, and that the preheader is hidden.
- **Placeholders:**
  - `{{first_name}}` with an empty name.
  - A name containing `<b>` (must be escaped).
  - An unfilled template field (sending blocked).
  - `{{unsubscribe_url}}` present vs absent, with the footer injected.
- **Tracking:** in workflow template mode, every link except unsubscribe is rewritten.
- **Isolation:** with a template open in the editor, admin page styles are unaffected.
- **Size:** a template above 90 KB shows the warning.

## 8. Decisions (8 Oct 2026)

1. **Every admin** can create, edit, duplicate and archive library templates. The API sits behind `requireStaff` with no role check.
2. **Brand is always The Product Space.** There is no brand column or picker filter. The template test send goes from `info@theproductspace.in`.
3. **No re-apply.** Choosing a template copies it, and the admin edits the copy there and then. Later changes to the library template never reach it.
4. **No "Save as template"** from a campaign.

## 9. As built — differences from the plan above

- **No shared `renderEmailBody` for the editor path.** Each send site branches on the mode and calls `renderTemplateEmail` (`utils/email/templateHtml.js`) for templates. The editor branch makes exactly the calls it made before, so its output can't drift and no comparison script is needed.
- **Workflow node handler** (`action.send_email.js`) skips `interpolate` for template bodies. `interpolate` doesn't escape and would blank `{{unsubscribe_url}}`; the dispatcher fills the body instead.
- **Click-tracking fix, applies to every workflow email:** `rewriteForTracking` now decodes `&amp;` in hrefs before minting the redirect. Previously any tracked link with a query string redirected to `?a=1&amp;b=2`.
- **HTML tab is a `<textarea>`**, not CodeMirror. The app has no code-editor dependency.
- **Phase 2 surfaces** (§5.7) are not started.

## 10. Template types and event campaigns (9 Oct 2026)

- **`email_library_templates.type`** is `'event'`, or null for a general template (`constants/emailTemplate.js`; migration `20261009120000`). It can be set on the create and detail pages and filtered on the list.
- **Campaigns only:** "Use a template" first asks *Is this an event campaign?*. If yes:
  1. choose the event (`GET /email-templates/events`);
  2. the picker shows event templates first;
  3. the event's details fill every field they answer (`GET /email-templates/events/:id/values`, built by `service/emailTemplate/eventTemplateValues.js`);
  4. only the fields left over are asked for. If none are left, the template is applied straight away.
- **Recognised event fields** (aliases in `EVENT_TEMPLATE_VARIABLES`):
  - title, subtitle, type;
  - date (`24–25 Oct 2026`) and time (`11:00 AM – 12:30 PM IST`);
  - location, join link;
  - event page (`register_url`), referral dashboard (`dashboard_url`);
  - WhatsApp default link. When an event has only student and professional groups, those are offered as one-click choices instead.
- Workflows don't ask, since a workflow step isn't tied to one event.

## 11. Phase 2 — every other email screen (9 Oct 2026)

"Use a template" is now on every admin screen that writes an email body:

| Screen | Event auto-fill | Send-time placeholders |
|---|---|---|
| Event registration emails (`EmailBodyBox`) | yes, this event | `name` |
| Event reminders (`ReminderEmailV2`) | yes, this event | `name` |
| Event certificate email (`CertificateEmailSlider`) | yes, this event | `name`, `recipientName`, `date`, `certificateId` |
| Free-course certificate email (same slider) | — | as above |
| Cohort enrolment email | — | `name` |
| Curriculum download email | — | `name`, `pdf_url` (new: the curriculum PDF link) |
| Resource download email | — | `name` |
| Newsletter | — | `name` reads "there"; unsubscribe link required |

**No mode columns.** These tables store one html string, and the body says what it is:
- `isTemplateDocument` (backend `utils/email/templateHtml.js`, mirrored in the admin) is true for `<!DOCTYPE html>` / `<html>` bodies, which the old editor cannot produce.
- Each send site does `renderIfTemplate(body, …) ?? <its existing path>`, so editor bodies are sent exactly as before.
- Because these screens record no `template_id`, they don't appear under a template's "Used in".

**Unfilled template fields block Save on these screens, not sending.** Their emails go out on a guest's action, and that must never fail.

**Also fixed:** reminder "Send now" used `agenda.cancel` without importing `agenda`. Every email went out, then the request returned 500 and the template never became `sent`. It now calls `cancelEventEmailTemplate`.
