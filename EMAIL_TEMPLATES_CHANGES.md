# Email Templates & "Use a template": change log

**Date:** 8–9 Oct 2026

**Repos touched:**
- `tps-backend` (in this monorepo)
- `product-space-admin` (`D:\Projects\The Product Space\product-space-admin`, a separate repo)

**Companion doc:** [EMAIL_TEMPLATES_PLAN.md](EMAIL_TEMPLATES_PLAN.md) is the original plan and the decisions behind it. This document lists **every change that was actually made**, file by file, with the reason for each.

---

## 0. The feature in one page

**What it does:**
- A new **Email Templates** page (sidebar → Marketing) stores full HTML email designs, such as `event-invite-email.html`.
- Every screen in the admin that writes an email body now has **Use a template**:
  - campaigns;
  - workflow email steps;
  - event registration and reminder emails;
  - certificate emails;
  - cohort and curriculum emails;
  - resource emails;
  - the newsletter.
- Choosing a template **copies** it into that email. The admin then edits the copy in place: text, links, buttons and images.
- The copy is **sent as-is**. It is not put inside the default grey "white card" wrapper.

**Why it needed more than "skip the wrapper":** the existing send pipeline actively damages a full HTML document.

| Existing step | What it does to a template |
|---|---|
| `cleanHtml` | Rewrites every `<p>` to `<div>` and replaces every `font-family`. The typography breaks. |
| `replacePlaceholders` / `\n → <br>` | Inserts `<br>` between every source line, including between `<tr>`s. Table layouts break in Outlook and Gmail. |
| `EmailTextEditor3` (the old body editor) | Is a `contentEditable` `<div>`. Setting `innerHTML` drops `<html>`, `<head>` and doctype, and the template's `<style>` would restyle the whole admin page. |

So templates got their **own editor** and their **own send path**. The old editor and its pipeline are byte-for-byte unchanged for every existing email.

**Key decisions (agreed 8 Oct):**
1. **Every admin** can create, edit, duplicate and archive library templates. There are no role checks.
2. **Brand is always The Product Space.** There is no brand column, and template test sends come from `info@theproductspace.in`.
3. **Copy, don't link.** Picking a template copies its HTML. Later edits to the library template never change an email already built from it.
   - *Why:* a workflow can send for months. Editing a template for next week's launch must not silently change what a live workflow sends today.
4. **No "Save as template"** from a campaign.

---

## 1. Shared concepts used everywhere below

### 1.1 Two kinds of email body

| | Editor body (old, the default) | Template body (new) |
|---|---|---|
| Looks like | an HTML fragment (`<div>Hi {{name}}…</div>`) | a full document (`<!DOCTYPE html><html>…`) |
| Edited in | `EmailTextEditor3` | `TemplateEmailEditor` (iframe) |
| Send path | `cleanHtml` → `replacePlaceholders` → `wrapEmailTemplate[WithUnsubscribe]` | `renderTemplateEmail`: fill placeholders (escaped) → optional link tracking → unsubscribe → **no wrapper** |

There are two ways of telling which kind a body is:
- **Campaigns and workflows (Phase 1)** store an explicit mode:
  - `campaigns.content_mode` (`editor` | `template`) plus `template_id`;
  - workflow node config `body_mode` plus `template_id`.
- **Every other surface (Phase 2)** has no mode column. The body itself says what it is: `isTemplateDocument(body)` is true when the body starts with `<!DOCTYPE html` or `<html` (comments allowed before it).
  - This is reliable because the old editor **cannot** produce either tag: the browser strips them from a `<div>`'s innerHTML.
  - *Why:* no migration on seven different tables, and no risk of a mode column getting out of sync with the body.

### 1.2 Three kinds of placeholder

| Kind | Examples | Filled when, and by whom |
|---|---|---|
| Recipient | `{{name}}`, `{{first_name}}` (new), `{{email}}`, `{{phone}}`, legacy `{{lead.*}}` | At send, per recipient, by the backend |
| System | `{{unsubscribe_url}}`, `{{website_url}}` | At send, by the backend |
| Send-time, per surface | Certificates: `{{recipientName}}`, `{{date}}`, `{{certificateId}}`. Curriculum: `{{pdf_url}}` | At send, by that surface's send site |
| Template field | anything else: `{{event_title}}`, `{{register_url}}`, `{{whatsapp_url}}`… | By the admin, **when the template is applied**, written into the copied HTML |

How values are treated:
- All values are **HTML-escaped** when filled. *Why:* a lead named `<b>Bob</b>` must not inject markup.
- A body with unfilled **template fields** is refused before it can reach recipients. Where the refusal happens:
  - campaigns refuse at schedule/send;
  - workflows refuse at node validation;
  - every Phase 2 screen refuses at Save.

### 1.3 Unsubscribe rules
- If the template contains `{{unsubscribe_url}}`, it is filled with the real link.
- If it does not, and the sender is one that gets an unsubscribe link today, a one-line footer with the link is **injected before `</body>`**.
- The unsubscribe link is **never click-tracked**. Link tracking runs while `{{unsubscribe_url}}` is still a literal placeholder, which is the same guarantee the old wrapper gave.

---

## 2. Backend: `tps-backend`

### 2.1 New files

#### `utils/email/templateHtml.js`: the template send path and helpers
This is the single home of all template logic, so every send site makes the same decisions.

| Export | What it does | Why |
|---|---|---|
| `findPlaceholders(html)` | Lists every `{{key}}` in the HTML. | Field detection. |
| `templateFieldKeys(html)` | The placeholders the admin still has to fill: everything except recipient and system keys. | Used for the "fields" list and for send blocking. |
| `fillPlaceholders(html, values)` | Replaces only the keys present in `values`, escaped. Supports dotted keys (`lead.name`). Leaves unknown keys untouched. | Lets fills happen in several passes (fields, then send-time values, then recipient values) without one pass erasing another's placeholders. |
| `firstNameOf(name)` | First word of the name, capitalised. | New `{{first_name}}` placeholder. |
| `sanitizeTemplateHtml(html)` | Strips `<script>`, `<iframe>`, `<object>`/`<embed>`, `<form>` and form controls, `on*=` handlers and `javascript:` URLs. Keeps `<style>`, `<head>`, MSO comments and `bgcolor`/`width`. Returns `{ html, removed }`. | Templates are previewed inside the admin. Email needs the presentational parts that a generic sanitiser would remove. Regex-based because the repo has no HTML parser dependency, and previews are also sandboxed (defence in depth). |
| `findRelativeImages(html)` | `<img src>` values that are not absolute `http(s)` URLs. | `logo.png` works on the author's disk only; such templates are refused on save. |
| `renderTemplateEmail({ html, recipient, unsubscribeUrl, requireUnsubscribe, trackLinks })` | The send path, in four steps (listed below). | One function used by campaigns, workflows, tests and every Phase 2 surface. |
| `isTemplateDocument(html)` | Doctype or `<html>` detection (§1.1). | Lets Phase 2 surfaces work with no mode column. |
| `renderIfTemplate(body, { name, email, phone, values, unsubscribeUrl, requireUnsubscribe })` | Returns the rendered template, or `null` if the body is not a template. | Each Phase 2 site becomes `renderIfTemplate(...) ?? <existing expression>`, so the old path is literally the old code. |

`renderTemplateEmail` runs these steps in order:
1. Fill the recipient and `website_url` placeholders, escaped.
2. Rewrite links for tracking, if a tracker was passed.
3. Fill `{{unsubscribe_url}}`, or inject the unsubscribe footer (§1.3).
4. Blank out any leftover `{{…}}`.

#### `models/emailLibraryTemplate.js`: model `EmailLibraryTemplate`, table `tps.email_library_templates`
- **Columns:**
  - `id` (ULID), `name`, `description`;
  - `type` (`'event'` or null);
  - `html`;
  - `fields` (JSONB `[{key,label}]`);
  - `preheader`, `size_bytes`;
  - `is_archived`;
  - `created_by`, `updated_by`, timestamps.
- **Why a new name:** `EmailTemplate` / `EmailTemplates` already exists. It holds the per-event email bodies.
- **Why archive, not delete:** campaigns keep a `template_id` for provenance.

#### Migrations
- `migrations/20261008120000-create-email-library-templates.js`:
  - creates `tps.email_library_templates` with an index on `is_archived`;
  - adds `content_mode` (STRING, NOT NULL, default `'editor'`) and `template_id` (STRING, null) to `tps.campaigns`.
- `migrations/20261009120000-add-type-to-email-library-templates.js` adds `type` (STRING, null) plus an index.

Both migrations follow these rules:
- They address tables as `{ tableName, schema: 'tps' }`.
- They run inside a transaction.
- *Why:* the first attempt's `addColumn` went to `public.campaigns`. `createTable` resolves through `search_path`, but `addColumn` did not. The stray empty table was dropped and the migration was re-run.

Existing campaign rows need no backfill: the default `'editor'` means today's behaviour.

> Also during setup: `ses_email_logs` already existed but its migration wasn't recorded, which blocked `db:migrate`. Fixed by inserting the matching `SequelizeMeta` row. No schema change.

#### `constants/emailTemplate.js`
- `EMAIL_TEMPLATE_TYPE` / `EMAIL_TEMPLATE_TYPES`: today only `event`. Null means general.
- `EVENT_TEMPLATE_VARIABLES`: each canonical event field and the aliases it answers to. For example, `event_title` also answers to `event_name`, and `event_url` also answers to `register_url`, `registration_url` and others.
- *Why aliases:* templates are written by hand, and `{{event_name}}` and `{{event_title}}` mean the same thing.

#### `service/emailTemplate/eventTemplateValues.js`
Turns an `Event` row into `{ values, suggestions }`:
- **Values** cover:
  - title, subtitle, type;
  - formatted date range (`Sat, 24 Oct 2026` or `24–25 Oct 2026`);
  - time in IST (`11:00 AM – 12:30 PM IST`);
  - location, join link;
  - event page URL, referral dashboard URL;
  - WhatsApp link.
- **Every alias** gets the value, so any naming used in a template is filled.
- **Suggestions:** when an event has only separate student and professional WhatsApp groups, both are offered as one-click choices instead of guessing.
- **Why:** the admin should only be asked for what the event can't answer.

#### `controllers/emailLibraryTemplate/emailLibraryTemplate.controller.js` and `routes/emailLibraryTemplateRoutes.js`
Mounted at `/email-templates` behind `requireStaff`, with no role gating (decision 1).

| Route | Purpose |
|---|---|
| `GET /` | List: `?archived=`, `?type=`, `?search=`. Includes usage counts. |
| `POST /` | Create. Sanitises, refuses relative images, rejects duplicate names among non-archived templates, derives `fields` (keeping authored labels) and `size_bytes`. Returns `removed` so the UI can say what sanitising stripped. |
| `GET /events` | Events to choose from for event campaigns, newest first. |
| `GET /events/:eventId/values` | That event's values (above). Declared **before** `/:id` so "events" is never read as a template id. |
| `GET /:id`, `PATCH /:id` | Read and update, with the same validation as create. |
| `GET /:id/usage` | Campaigns and workflow steps whose `template_id` points here ("Used in"). |
| `POST /:id/duplicate` | Copy as "Name (copy)". |
| `PATCH /:id/archive` | Archive or unarchive. |
| `POST /:id/send-test` | Sends from `info@theproductspace.in`. Fields are shown as `[Label]`, and the recipient is "Test User". |

`server.js` gained one `require` and `app.use('/email-templates', emailLibraryTemplateRoutes)`.

### 2.2 Phase 1: campaigns and workflows (explicit mode)

| File | Change | Why |
|---|---|---|
| `models/campaign.js` | Added `content_mode` (default `'editor'`) and `template_id`. | Campaigns carry an explicit mode (§1.1). |
| `jobs/campaignScheduler.js` | Template campaigns skip `cleanHtml` and go through `renderTemplateEmail`. `requireUnsubscribe` is true unless the sender is a Gradient address. The editor branch is unchanged, and the Gradient check was pulled into `isGradientSender`. | The real campaign send. Same unsubscribe rule as the old wrappers: Gradient senders never had a footer. |
| `controllers/campaign/campaign.controller.js` | `schedule` returns 400 listing unfilled template fields. `sendTestMail` renders templates via `renderTemplateEmail`. | Stops a blank heading or a dead button from reaching everyone. Test sends match real sends. |
| `service/workflow/engine/nodeHandlers/action.send_email.js` | For `body_mode === 'template'`, passes `html_body` without `interpolate`, plus `bodyMode` and `recipient`. | `interpolate` doesn't escape values, and it would blank `{{unsubscribe_url}}` before the dispatcher could fill it. |
| `service/workflow/dispatchers/emailDispatcher.js` | New `bodyMode`/`recipient` params. The template branch calls `renderTemplateEmail` with `trackLinks` set to `rewriteForTracking` and `requireUnsubscribe: true`. The editor branch is the old code moved into an `else`. | Tracking still works for templates, and the unsubscribe link is still never tracked. |
| `controllers/workflow/workflow.controller.js` | `sendTestEmail` accepts `body_mode` and renders templates without cleanup or wrapper. | Test sends match real sends. |
| `service/workflow/validation/nodeConfigSchemas.js` | A template step with unfilled fields fails validation: "fill in the template fields: …". | Blocks activating a workflow that would mail blanks. |
| `service/workflow/tracking/rewriteForTracking.js` | Decodes `&amp;` → `&` in hrefs before minting the tracked redirect. | **Bug fix affecting every workflow email.** Links with query strings redirected to `?a=1&amp;b=2`. Templates made it obvious because escaped field values always contain `&amp;`. |

### 2.3 Phase 2: every other send site (body detection, no migration)

Each site keeps its old expression as the fallback:

```js
const htmlContent =
  renderIfTemplate(body, { name, email, ...surfaceExtras }) ??
  wrapEmailTemplate(cleanHtml(replacePlaceholders(body, { name })));   // unchanged
```

| File | Surface | Extras passed |
|---|---|---|
| `service/events/eventCreateEmail.service.js` | Event registration email (guest registers) | `name`, `email` |
| `controllers/notificationController.js` | Event approve / decline / reschedule emails | `name`, `email` |
| `jobs/eventEmailScheduler.js` | Scheduled event reminders | `name`, `email` |
| `controllers/eventEmailTemplateController.js` | Reminder test send and **Send now** | `name`, `email` |
| `controllers/eventCertificateController.js` | Event certificate: single, bulk, test | `values`: `recipientName`, `date`, `certificateId` (sample values for the test) |
| `controllers/courses/courseCertificateController.js` | Course certificate send | same certificate values |
| `controllers/courses/certificateTemplateController.js` | Course certificate test | sample certificate values |
| `controllers/programOfferController.js` | Cohort enrolment and curriculum download | `values: { pdf_url }`: **new**, the curriculum PDF link, usable as a button URL |
| `controllers/resourceController.js` | Resource download email | `name`, `email`, `phone` |
| `controllers/newsletterController.js` | Newsletter (`buildHtmlFor`) | `name: "there"` (subscribers have no name), `unsubscribeUrl`, `requireUnsubscribe: true` (marketing mail) |

**Why `renderIfTemplate(...) ?? old`:** non-template bodies run the exact same code as before, so no existing email can change.

**Bug fixed on the way.** In `eventEmailTemplateController.js`, reminder **Send now** called `agenda.cancel(...)`, but `agenda` was never imported.
- **Symptom:** every email went out, then the request threw. The admin saw a 500, and the reminder never became `sent`.
- **Fix:** it now calls the existing `cancelEventEmailTemplate(template.id)`.

---

## 3. Admin: `product-space-admin`

### 3.1 Shared foundations (new)

| File | What | Why |
|---|---|---|
| `src/types/emailTemplate.ts` | `EmailLibraryTemplate`, `TemplateField`, `EmailBodyMode`, `EmailBodyValue {html, mode, templateId}`, `TemplateEventOption`, `EventTemplateValues`. | Typed contract with the API. |
| `src/services/emailTemplate/emailTemplateService.ts` | Client for every `/email-templates` route, plus image upload. | The upload uses `PrivateAxios` with multipart headers. *Why:* `PrivateUploadAxios` sends no auth token, so uploads were rejected. |
| `src/lib/emailTemplate/templateHtml.ts` | Client mirror of the backend helpers, plus a few UI-only helpers (listed below). | Instant feedback while typing. The server stays the authority and re-checks on save. |

The UI-only helpers in `templateHtml.ts`:
- `findPlaceholders`, `templateFieldKeys(html, sendTimeKeys)`, `isTemplateDocument`;
- `fillFields`, `escapeHtml`, `humanizeKey`, `isUrlKey`, `isValidLink`;
- `sanitizeTemplateHtml`;
- `previewHtml`: sample recipient values, with fields shown as `[Label]`;
- `GMAIL_CLIP_WARN_BYTES` (90 KB).

### 3.2 The template editor (new, `src/components/Rich-Text-Editor/TemplateEmail/`)

| File | What | Why |
|---|---|---|
| `TemplateEmailEditor.tsx` | Three tabs: **Edit**, **Preview** (desktop 600px / mobile 375px) and **HTML** (a `<textarea>`). Details below. | The core of "edit text, links and buttons". |
| `templateEditorDom.ts` | DOM logic used inside the iframe (details below). | Enforces **content editable, layout locked**: one stray Backspace in a table cell would delete a `<td>` and break the layout in Outlook. |
| `TemplatePreviewFrame.tsx` | Read-only `<iframe srcdoc sandbox="allow-same-origin">` with no scripts. Auto-height; optional `scale` for thumbnails. | Template CSS can never leak into the admin, and nothing inside can run. |
| `TemplatePickerDialog.tsx` | Search plus cards with live thumbnails and a large preview. With `preferType="event"`, event templates are listed first. | "Use a template" picker. |
| `TemplateFieldsDialog.tsx` | Asks for the template's fields. Event-filled values appear first under "Filled from <event>" and stay editable. WhatsApp suggestions are one-click chips. URL fields are validated. Blank is allowed (it stays unfilled). | Only leftover variables are asked for. A blank lets the admin apply a template before every link is to hand. |
| `EventCampaignDialog.tsx` | "Is this an event campaign?" → Yes (searchable event list) / No. | The event step for campaigns. |
| `EmailBodyField.tsx` | Switches between `EmailTextEditor3` and `TemplateEmailEditor`. Details below. | One component gives every surface the same behaviour. |
| `EmailBodyInput.tsx` | Drop-in replacement for `EmailTextEditor3` on Phase 2 screens: plain `string` in and out, with the mode derived via `isTemplateDocument`. Also exports `unfilledTemplateFields(html, sendTimeKeys)`, `CERTIFICATE_SEND_TIME_KEYS` and `CURRICULUM_SEND_TIME_KEYS`. | Phase 2 screens store one string and have no mode column (§1.1). |

**`TemplateEmailEditor.tsx`, Edit tab:**
- The template renders inside an `<iframe srcdoc>`.
- Text blocks are editable in place: bold, italic, underline and link, with plain-text paste.
- Clicking a **link** opens a dialog for its text and URL.
- Clicking a **button** opens a dialog for text, URL, background and text colour. Colour is written to the `<a>` and to its `td`'s `bgcolor` and style, so Outlook and Gmail agree.
- Clicking an **image** opens a dialog to replace it (upload), or change its alt text, link or width.
- Top-level rows have move up/down, duplicate and delete.
- Undo/redo works by snapshots.
- `onChange` is debounced.

*Why an iframe:* the template's `<style>` and media queries apply only to the email, never to the admin. The same frame at 375px gives the mobile preview.

**`templateEditorDom.ts`:**
- `tagDocument` marks text, link, button and image elements. Only text blocks with no structural children get `contenteditable`.
- `buttonCellOf` detects "bulletproof" buttons (an `<a>` in a painted `td`).
- `containerRows` finds the top-level rows for move, duplicate and delete.
- `serialize` strips every editor-only attribute and style, so the saved HTML is the template, not the editor.

**`EmailBodyField.tsx`** has a header showing:
- "From template: X";
- the event badge;
- **Use a template** / **Change template**, **Fill in fields** and **Plain editor**.

It also:
- shows an amber warning listing unfilled fields;
- shows a "filled automatically when sent" hint for send-time keys;
- confirms before replacing a non-empty body, and before switching back to the plain editor (which clears the body).

Its props:
- `askEvent` (campaigns): asks "is this an event campaign?" first, then fills from the chosen event.
- `eventId` (event screens): the event is already known, so its values load immediately with no question. If loading fails, the admin is told and fills by hand.
- `sendTimeKeys`: placeholders this surface fills at send, which are never asked for.

If every field is answered by the event, the template is applied immediately with a toast ("Filled N fields from …"). Otherwise the Fields dialog opens.

### 3.3 Email Templates page (new)

**Routes** (both trees, like campaigns):
- `src/app/admin/marketing/email-templates/page.tsx`, `/new/page.tsx` and `/[id]/page.tsx`;
- the same three under `src/app/superadmin/marketing/email-templates/`.

**Sidebars:** `AdminSidebar.tsx` and `SuperAdminSidebar.tsx` gained a **Marketing → Email Templates** entry after Campaigns.

**Shared page components** (`src/components/Pages/Common/emailTemplates/`):

| File | What |
|---|---|
| `EmailTemplatesPage.tsx` | Card grid with live thumbnails, name, type, last edited and "Used in N". Search, type filter and an Archived toggle. Per-card Open / Duplicate / Send test / Archive. |
| `EmailTemplateCreatePage.tsx` | Name, type and description, plus **Upload .html** or **Paste HTML**. Runs the checks, then saves and opens the template. |
| `EmailTemplateDetailPage.tsx` | Edit (`TemplateEmailEditor`, with fields shown unfilled as the master copy), editable field labels, type, Send test, Duplicate, Archive, and **Used in** links. |
| `TemplateChecks.tsx` | Before save, three checks (below). |
| `TemplateTypeSelect.tsx` | General / Event selector. |
| `SendTestDialog.tsx` | Test-send to an address. |
| `useBasePath.ts` | `/admin` vs `/superadmin` link base. |

The three checks in `TemplateChecks.tsx`:
- **Images:** each relative `src` gets an **Upload** button that rewrites it to the public URL. Saving is blocked until there are none.
- **Fields:** the detected fields, with editable labels.
- **Warnings:** no `{{unsubscribe_url}}` (a footer will be added), size above 90 KB (Gmail clips at about 102 KB, hiding the unsubscribe link), and what sanitising removed.

### 3.4 Phase 1 integrations (campaigns and workflows)

| File | Change | Why |
|---|---|---|
| `src/types/campaign.ts` | `content_mode?`, `template_id?`, `scheduled_at?`. | Typed fields. |
| `src/types/workflow.ts` | `SendEmailConfig.body_mode?`, `template_id?`. A missing value means editor. | Old steps keep working. |
| `campaigns/CampaignEditPage/CampaignEditPage.tsx` | `EmailTextEditor3` → `EmailBodyField askEvent`. Saves `content`, `content_mode` and `template_id`. Pre-send validation flags "Email (fill in the template fields)". Copy/paste now stores `{content, mode, templateId}` as JSON and still reads old plain-string copies. The variable hint adds `{{first_name}}` and `{{email}}` in template mode. | A template pasted as an editor body would be wrapped and broken, so the mode has to travel with the body. |
| `workflows/editor/NodeConfigSheet.tsx` | `EmailTextEditor3` → `EmailBodyField`. Persists `body_mode` and `template_id`. Copy/paste between nodes carries the mode. Test send passes `body_mode` and skips the client `cleanHtml` for templates. | Same reasons, and test sends match real sends. |
| `workflows/editor/utils.ts` | `cleanEmailNodes` skips template-mode nodes. | The save-time `cleanHtml` would rewrite the template's fonts and `<p>` tags. |
| `services/workflow/workflowService.ts` | `sendTestEmail` payload accepts `body_mode`. | Matches the backend. |

### 3.5 Phase 2 integrations (every other email screen)

On each screen:
- `EmailTextEditor3` → `EmailBodyInput`.
- The Save handler refuses while `unfilledTemplateFields(...)` is non-empty, showing "Fill in the template fields first: …".
- *Why Save and not send:* these emails go out on a guest's action (registering, downloading), and that must never fail.

All files are under `src/components/`:

| File | Surface | Event auto-fill | Send-time keys |
|---|---|---|---|
| `Pages/Common/EventCommonComponents/EnrollmentSilder/EmailBodyBox/EmailBodyBox.tsx` | Event registration emails | yes, `eventId` | — |
| `Pages/Common/EventCommonComponents/ReminderEmailV2/ReminderEmailV2.tsx` | Event reminders | yes, `eventId` | — |
| `Common/CertificateEditor/CertificateEmailSlider.tsx` | Certificate email (shared by events and free courses). Gained an optional `eventId` prop. | when given | `CERTIFICATE_SEND_TIME_KEYS` |
| `Pages/Common/EventCommonComponents/CertificateTemplate/CertificateEmail/CertificateEmail.tsx` | Passes `eventId` to the slider. | — | — |
| `Pages/Common/Cohort/EnrolmentEmail/EnrolmentEmail.tsx` | Cohort enrolment email | — | — |
| `Pages/Common/Cohort/DownLoadCurricullumEmail/DownLoadCurricullumEmail.tsx` | Curriculum download email | — | `CURRICULUM_SEND_TIME_KEYS` (`pdf_url`) |
| `Pages/Common/Resources/ManageResources/EmailTemplate/EmailTemplate.tsx` | Resource download email. Its preview pane now shows template bodies in `TemplatePreviewFrame`. | — | — |
| `Pages/Common/Newsletter/NewsletterManager.tsx` | Newsletter compose. The history view shows template bodies in `TemplatePreviewFrame`. | — | — |

**Why the preview and history changes:** those panes used `dangerouslySetInnerHTML`. A template's `<style>` injected there would restyle the whole admin page.

---

## 4. Verification

**Done:**
- Admin `npx tsc --noEmit`: 0 errors.
- Backend `node --check` on every changed file.
- Backend helpers exercised in scripts, covering:
  - escaping;
  - `{{first_name}}`;
  - unfilled-field detection;
  - unsubscribe fill vs footer injection;
  - `isTemplateDocument` on editor output vs templates;
  - `&amp;` tracking fix.
- Event values built from real events in the local DB: date ranges, IST times, WhatsApp suggestions.
- `TemplateEmailEditor` driven in headless Edge:
  - round-trip of `event-invite-email.html` with no edits keeps the `<style>`, MSO comments and preheader;
  - edits to text, buttons and links touch only those nodes;
  - no editor attributes leak into the saved HTML.
- Migrations applied on the local DB (`127.0.0.1:15432`, schema `tps`).

**Not yet done:**
- Clicking through the live admin UI end-to-end on each screen.
- Real sends to Gmail, Outlook and Apple Mail: button colours, mobile stacking, hidden preheader.

---

## 5. Known limitations and follow-ups

- **Phase 2 screens record no `template_id`,** so emails built there don't appear under a template's "Used in". Only campaigns and workflow steps do.
- **Duplicating an event copies its email bodies as they are,** including template bodies already filled with the *old* event's title, dates and links. They need re-filling: choose **Change template**, or edit them in place.
- **The HTML tab is a plain `<textarea>`.** There is no code-editor dependency in the admin.
- **The sanitiser is regex-based.** It is acceptable for staff-authored input, and previews are sandboxed too.

---

## 6. Deploy checklist

1. `tps-backend`: run `npx sequelize-cli db:migrate`. It adds `email_library_templates`, its `type` column, and `campaigns.content_mode`/`template_id`.
2. Restart `tps-backend`. This picks up the new routes and every changed send site.
3. Deploy `product-space-admin`.
4. Smoke test:
   1. Create a template from `event-invite-email.html` (upload `logo.png` in the checks step).
   2. Use it in a test campaign as an event campaign.
   3. Send a test.
   4. Do the same on one event reminder and on the newsletter.
