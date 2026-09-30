# Backend Email Dispatch Analysis (`sendEmail`)

This document provides a comprehensive audit of where, why, and for whom emails are sent across this backend repository. It specifically covers all 19 files identified in the global search for `sendEmail`, along with high-level architecture notes and other direct email dispatchers in the codebase.

---

## 1. High-Level Architecture Overview

Email dispatch in this backend follows three main architectural paths:

1. **Unified Email Router (`service/mail/sendEmail.js`)**:
   Acts as the central gateway for campaigns, drip workflows, newsletters, and support queries. It inspects the `from` address and delegates delivery to:
   - **Microsoft Graph API**:
     - `info@theproductspace.in` ➔ `sendGraphEmail`
     - `akhil@theproductspace.in` ➔ `sendGraphEmailSecondary`
     - `info@thegradient.co.in` ➔ `sendGraphEmailTertiary`
   - **AWS SES**:
     - `noreply@theproductspace.in` ➔ `sendAwsMail`
     - `noreply@gradientlearnings.org` ➔ `sendAwsGradientMail`
   - Also tracks daily/hourly sender limits via `updateSenderEmailUsage(from)`.

2. **Nodemailer SMTP Transporters (`utils/sendEmail.js`, `utils/sendOutlookEmail.js`)**:
   Standalone direct SMTP utilities using environment credentials (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`). Used for internal admin/company staff onboarding invites and legacy teardown invitations.

3. **Calendar Invite Dispatcher (`utils/email/sendCalendarEmail.js`)**:
   Builds `.ics` calendar invitation payloads (`METHOD:REQUEST`, `BEGIN:VEVENT`) and dispatches them via Microsoft Graph API (`/sendMail` endpoint) for webinars, teardowns, and hackathons.

---

## 2. Detailed File-by-File Breakdown (19 Files)

---

### File 1: `controllers/newsletterController.js`
* **File Name**: [`controllers/newsletterController.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/controllers/newsletterController.js)
* **Where Called**:
  * **Location 1 (Bulk Send)**: Line 212 inside `sendOne(toEmail)` in the `exports.sendBulk` handler (`POST /newsletter/send-bulk`).
  * **Location 2 (Test Send)**: Line 344 inside `exports.sendTest` handler (`POST /newsletter/send-test`).
* **Why Called**:
  * **Bulk Send**: Triggered by an admin to broadcast newsletter emails. Executes in the background with a 250ms delay between consecutive dispatches to stay within Graph API rate limits (~4 req/sec). Injects unsubscribe tokens and tracking.
  * **Test Send**: Allows an administrator to test layout, formatting, and email client rendering with a single preview send prior to mass delivery.
* **For Which Users It Gets Called**:
  * **Bulk Send**: Active subscribers in the `NewsletterEmail` table (`status = 'subscribed'`), optionally filtered by creation date or selected email lists. Automatically filters out globally opted-out recipients (`filterUnsubscribedRecipients`).
  * **Test Send**: Sent to the test email address entered by the admin in `req.body.email`.
* **Sender Address**: `info@theproductspace.in`, `akhil@theproductspace.in`, or `noreply@theproductspace.in` (defaults to `info@theproductspace.in`).

---

### File 2: `jobs/campaignScheduler.js`
* **File Name**: [`jobs/campaignScheduler.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/jobs/campaignScheduler.js)
* **Where Called**:
  * Line 184 inside `processCampaign(campaignId)` within the Agenda background job worker (`send-scheduled-campaigns`).
* **Why Called**:
  * Automated marketing/broadcast campaigns. When a scheduled campaign's trigger time arrives, the Agenda background worker picks it up and processes pending recipients in batches of 50. Replaces personalized placeholders (like `{{name}}`), wraps HTML with unsubscribe headers, and dispatches via `service/mail/sendEmail`. Updates recipient status to `SENT` or `FAILED`.
* **For Which Users It Gets Called**:
  * Targeted audience members stored in the `campaign_recipients` table linked to that campaign ID with `status = 'pending'` (e.g., imported leads, registered event cohorts, workshop signups).
* **Sender Address**: Dynamic sender configured on the campaign (`campaign.sender_email`, e.g., `info@theproductspace.in`, `info@thegradient.co.in`, `noreply@theproductspace.in`, or `noreply@gradientlearnings.org`).

---

### File 3: `service/workflow/dispatchers/emailDispatcher.js`
* **File Name**: [`service/workflow/dispatchers/emailDispatcher.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/service/workflow/dispatchers/emailDispatcher.js)
* **Where Called**:
  * Line 113 inside `async function dispatchEmail({...})`.
  * Invoked by workflow action node handler: [`service/workflow/engine/nodeHandlers/action.send_email.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/service/workflow/engine/nodeHandlers/action.send_email.js) at line 22.
* **Why Called**:
  * Execution of visual automated drip workflows (e.g., lead nurture drips, onboarding sequences, post-webinar follow-ups).
  * Enforces opt-out compliance via `isEmailOptedOut`, rewrites links and pixels for engagement tracking, appends RFC `List-Unsubscribe` / `List-Unsubscribe-Post` headers, and sends through `service/mail/sendEmail`.
* **For Which Users It Gets Called**:
  * Enrolled leads / prospects / students currently progressing through an active automated workflow when an Email Action Node is reached.
* **Sender Address**: Sender specified in the workflow node parameters (`from` and `fromName`).

---

### File 4: `controllers/workflow/workflow.controller.js`
* **File Name**: [`controllers/workflow/workflow.controller.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/controllers/workflow/workflow.controller.js)
* **Where Called**:
  * Line 649 inside `exports.sendTestEmail` (`POST /admin/workflows/test-email`).
* **Why Called**:
  * Workflow canvas visual editor test functionality. Enables administrators and marketing designers to preview how an automated workflow email node will look in an inbox with sample variables (`name: "Test User"`, `phone`, etc.) before publishing the workflow live.
* **For Which Users It Gets Called**:
  * The test email address specified in `req.body.to_email` by the admin.
* **Sender Address**: The sender address set on the workflow node draft (`req.body.from_email`).

---

### File 5: `controllers/campaign/campaign.controller.js`
* **File Name**: [`controllers/campaign/campaign.controller.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/controllers/campaign/campaign.controller.js)
* **Where Called**:
  * Line 286 inside `exports.sendTestMail` (`POST /campaign/:id/test`).
* **Why Called**:
  * Pre-launch campaign verification. Allows admins or marketers to send an immediate sample email to check formatting, subject line variables, and button links before officially queueing or scheduling the campaign.
* **For Which Users It Gets Called**:
  * The tester's email address specified in `req.body.email`.
* **Sender Address**: The sender address configured on the campaign record (`campaign.sender_email`).

---

### File 6: `service/support/supportEmails.js`
* **File Name**: [`service/support/supportEmails.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/service/support/supportEmails.js)
* **Where Called**:
  * Line 46 inside helper function `send(to, subject, html)`.
  * Triggered by:
    1. Line 51: `sendTicketCreated(ticket)`
    2. Line 65: `sendNewReply(ticket)`
    3. Line 79: `sendTicketClosed(ticket)`
* **Why Called**:
  * **Ticket Created**: Dispatches a confirmation email with the ticket reference number when a user submits a support query on the platform.
  * **New Reply**: Alerts the user when support agents post a response to their support ticket.
  * **Ticket Closed**: Informs the user when their support ticket has been resolved or closed.
* **For Which Users It Gets Called**:
  * The user/student who created the support ticket (`ticket.requester_email`).
* **Sender Address**: `noreply@theproductspace.in` ("The Product Space Support") via AWS SES.

---

### File 7: `controllers/companyAuthController.js`
* **File Name**: [`controllers/companyAuthController.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/controllers/companyAuthController.js)
* **Where Called**:
  * Line 164 inside `inviteUser(req, res)` (`POST /company/invite`).
* **Why Called**:
  * Inviting new staff or administrators to the internal company portal. Generates a unique UUID invite token, stores it on the company record, formats an invitation email with a registration link (`${ADMIN_FRONTEND_URL}/auth/invite?token=...`), and delivers it.
* **For Which Users It Gets Called**:
  * The newly invited company admin or employee (`req.body.email`).
* **Sender Address**: `process.env.EMAIL_USER` via direct Nodemailer SMTP (`utils/sendEmail.js`).

---

### File 8: `service/events/eventCreateEmail.service.js`
* **File Name**: [`service/events/eventCreateEmail.service.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/service/events/eventCreateEmail.service.js)
* **Where Called**:
  * Line 77 calls `sendEmailWithCalendarInviteStaging({...})` inside `triggerEventCreatedEmail({...})`.
* **Why Called**:
  * Dispatched when a user successfully registers for an event (e.g. Teardown or Hackathon) or when their guest registration status transitions to "Approved". Creates a structured iCalendar `.ics` file containing event dates, times, and location, attaching it to the confirmation email.
  * *(Note: If the registration is "Pending", line 60 calls `sendGraphEmail` directly without calendar attachment).*
* **For Which Users It Gets Called**:
  * The registered attendee (`user.email` found via `userId`).
* **Sender Address**: `process.env.EMAIL_OUTLOOK_USER` via Microsoft Graph API.

---

### File 9: `controllers/notificationController.js`
* **File Name**: [`controllers/notificationController.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/controllers/notificationController.js)
* **Where Called**:
  * Lines 135 & 152 call `sendEmailWithCalendarInvite({...})` inside `sendNotification`.
  * Line 228 calls `sendEmailWithCalendarInviteStaging({...})` inside `sendTestNotification`.
* **Why Called**:
  * **Live Send**: Admin dispatches notifications and calendar `.ics` invites for upcoming events/hackathons to a list of users.
  * **Test Send**: Admin sends a sample calendar invite email to test attendees to preview the event details.
* **For Which Users It Gets Called**:
  * Users whose IDs are passed in `req.body.userIds` matching the specified event.
* **Sender Address**: `process.env.EMAIL_OUTLOOK_USER` via Microsoft Graph API.

---

### File 10: `controllers/eventEmailTemplateController.js`
* **File Name**: [`controllers/eventEmailTemplateController.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/controllers/eventEmailTemplateController.js)
* **Where Called**:
  * Comment on Line 353: `// POST /events/email/template/sendEmailNow`.
  * Email dispatch executed on Line 412 via `sendGraphEmail` inside `sendReminderEmailNow(req, res)`.
* **Why Called**:
  * Admin manually triggers immediate dispatch of a saved event reminder email template. It cancels any pending scheduled Agenda jobs for that template and immediately sends the reminder.
* **For Which Users It Gets Called**:
  * Guests of the event (`EventGuests` joined with `users`), filtered by `targetGuestType` and `targetGuestRole` (e.g. Approved attendees, Students, Professionals).
* **Sender Address**: Default Microsoft Graph API sender (`info@theproductspace.in`).

---

### File 11: `routes/eventRoutes.js`
* **File Name**: [`routes/eventRoutes.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/routes/eventRoutes.js)
* **Where Called**:
  * Line 61:
    ```javascript
    router.post("/events/email/template/sendEmailNow", emailTemplateController.sendReminderEmailNow);
    ```
* **Why Called**:
  * Route definition mapping the HTTP POST endpoint `/events/email/template/sendEmailNow` to `emailTemplateController.sendReminderEmailNow`.
* **For Which Users It Gets Called**:
  * N/A (Route endpoint declaration).

---

### File 12: `service/mail/sendEmail.js`
* **File Name**: [`service/mail/sendEmail.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/service/mail/sendEmail.js)
* **Where Called**:
  * Line 27: Function definition `async function sendEmail({ to, subject, html, from, fromName, id, headers, out })`.
* **Why Called**:
  * **Core Dispatch Gateway**: Central routing function for the backend. Routes delivery based on sender:
    - `info@theproductspace.in` ➔ `sendGraphEmail`
    - `akhil@theproductspace.in` ➔ `sendGraphEmailSecondary`
    - `info@thegradient.co.in` ➔ `sendGraphEmailTertiary`
    - `noreply@theproductspace.in` ➔ `sendAwsMail`
    - `noreply@gradientlearnings.org` ➔ `sendAwsGradientMail`
    - Automatically triggers `updateSenderEmailUsage(from)` to record usage statistics.
* **For Which Users It Gets Called**:
  * All users and leads receiving emails from newsletters, campaigns, workflows, or support.

---

### File 13: `utils/sendEmail.js`
* **File Name**: [`utils/sendEmail.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/utils/sendEmail.js)
* **Where Called**:
  * Line 15: Function definition `const sendEmail = async (to, subject, content, isHtml = false)`.
* **Why Called**:
  * Direct Nodemailer SMTP transporter implementation (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`). Used by `companyAuthController.js` to send company team invitations.
* **For Which Users It Gets Called**:
  * Company staff / admin portal invitees.

---

### File 14: `utils/sendOutlookEmail.js`
* **File Name**: [`utils/sendOutlookEmail.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/utils/sendOutlookEmail.js)
* **Where Called**:
  * Line 32: Function definition `const sendEmail = async (to, subject, content, isHtml = false)`.
* **Why Called**:
  * Legacy Nodemailer SMTP transporter paired with `teardownEmailTemplate` for sending teardown event invitation emails.
* **For Which Users It Gets Called**:
  * Teardown event invitees.

---

### File 15: `utils/email/sendCalendarEmail.js`
* **File Name**: [`utils/email/sendCalendarEmail.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/utils/email/sendCalendarEmail.js)
* **Where Called**:
  * Line 140: Function definition `sendEmailWithCalendarInviteStaging`.
  * Line 197: Function definition `sendEmailWithCalendarInvite`.
* **Why Called**:
  * Formats an `.ics` MIME attachment from event timing metadata and delivers the invite email using Microsoft Graph API (`https://graph.microsoft.com/v1.0/users/${EMAIL_OUTLOOK_USER}/sendMail`).
* **For Which Users It Gets Called**:
  * Attendees registered for hackathons, webinars, and teardowns.

---

### File 16: `utils/email/sendAwsEmail.js`
* **File Name**: [`utils/email/sendAwsEmail.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/utils/email/sendAwsEmail.js)
* **Where Called**:
  * Line 3: Matched via `const { SendEmailCommand } = require("@aws-sdk/client-ses");`.
  * Line 8: Function definition `sendAwsMail({ to, subject, html, fromName, headers, id })`.
* **Why Called**:
  * AWS SES dispatch driver for `noreply@theproductspace.in`. Injects correlation tag `ps_msg_id` for bounce/complaint handling.
* **For Which Users It Gets Called**:
  * Recipients of system emails, support notifications, and large volume campaign blasts from The Product Space.

---

### File 17: `utils/email/sendAwsGradientMail.js`
* **File Name**: [`utils/email/sendAwsGradientMail.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/utils/email/sendAwsGradientMail.js)
* **Where Called**:
  * Line 3: Matched via `const { SendEmailCommand } = require("@aws-sdk/client-ses");`.
  * Line 6: Function definition `sendGradientAwsMail({ to, subject, html, fromName, headers, id })`.
* **Why Called**:
  * AWS SES dispatch driver for `noreply@gradientlearnings.org` (the Gradient sub-brand).
* **For Which Users It Gets Called**:
  * Recipients of campaigns and communications sent under the Gradient Learnings brand.

---

### File 18: `service/workflow/publish/publishWorkflow.js`
* **File Name**: [`service/workflow/publish/publishWorkflow.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/service/workflow/publish/publishWorkflow.js)
* **Where Called**:
  * Line 15: Code comment and validation set:
    ```javascript
    // Senders verified in service/mail/sendEmail.js. Keep in sync with the
    // PROVIDERS map there. Email nodes whose from_email isn't in this list will
    // fail to send at runtime, so we reject them at publish time.
    const VERIFIED_SENDERS = new Set([...]);
    ```
* **Why Called**:
  * Publish-time validation guard. Validates that every email node in a workflow has a verified sender address configured before promoting the workflow from `draft` to `active`. Does not send emails at runtime.
* **For Which Users It Gets Called**:
  * N/A (Admin validation rule).

---

### File 19: `service/workflow/README.md`
* **File Name**: [`service/workflow/README.md`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/service/workflow/README.md)
* **Where Called**:
  * Line 104:
    ```markdown
    - `dispatchers/emailDispatcher.js` — wraps `service/mail/sendEmail`. Opt-out...
    ```
* **Why Called**:
  * Architecture documentation describing the workflow execution engine and explaining how `emailDispatcher.js` wraps `service/mail/sendEmail`.
* **For Which Users It Gets Called**:
  * N/A (Documentation file).

---

## 3. Quick Reference Matrix

| # | File Name | Invocation Location | Trigger Event | Target Recipient | Provider |
|---|---|---|---|---|---|
| **1** | `newsletterController.js` | `sendBulk` (L212), `sendTest` (L344) | Mass newsletter broadcast or admin preview | Subscribed users / Admin tester | Graph / SES via router |
| **2** | `campaignScheduler.js` | `processCampaign` (L184) | Scheduled Agenda campaign job | Targeted campaign audience list | Graph / SES via router |
| **3** | `emailDispatcher.js` | `dispatchEmail` (L113) | Automated drip sequence node | Leads enrolled in workflow | Graph / SES via router |
| **4** | `workflow.controller.js` | `sendTestEmail` (L649) | Workflow canvas test send | Admin tester | Graph / SES via router |
| **5** | `campaign.controller.js` | `sendTestMail` (L286) | Pre-launch campaign preview | Admin tester | Graph / SES via router |
| **6** | `supportEmails.js` | `send` (L46) | Ticket created, replied, or closed | Support ticket requester | AWS SES (`noreply@...`) |
| **7** | `companyAuthController.js`| `inviteUser` (L164) | Company staff invitation | Invited company staff member | Nodemailer SMTP |
| **8** | `eventCreateEmail.service.js` | `triggerEventCreatedEmail` (L77) | Event registration / approval | Event registrant | Graph API (`.ics` invite) |
| **9** | `notificationController.js` | `sendNotification` (L135, L152), `sendTestNotification` (L228) | Hackathon/event notification | Selected user IDs | Graph API (`.ics` invite) |
| **10**| `eventEmailTemplateController.js` | `sendReminderEmailNow` (L353, L412) | Manual instant event reminder blast | Event guests / filtered cohorts | Graph API |
| **11**| `eventRoutes.js` | Route declaration (L61) | Route `/events/email/template/sendEmailNow` | N/A | N/A |
| **12**| `sendEmail.js` (service) | `sendEmail` (L27) | Central email router | All callers above | Central Provider Router |
| **13**| `sendEmail.js` (utils) | `sendEmail` (L15) | Direct SMTP transporter | Company invitation recipients | Nodemailer SMTP |
| **14**| `sendOutlookEmail.js` | `sendEmail` (L32) | Teardown invite helper | Teardown invitees | Nodemailer SMTP |
| **15**| `sendCalendarEmail.js` | `sendEmailWithCalendarInvite...` (L140, L197) | Calendar `.ics` builder & sender | Event & hackathon attendees | Graph API |
| **16**| `sendAwsEmail.js` | AWS SES `SendEmailCommand` (L3) | Direct AWS SES dispatch helper | TPS AWS recipients | AWS SES |
| **17**| `sendAwsGradientMail.js` | AWS SES `SendEmailCommand` (L3) | Direct AWS SES dispatch helper | Gradient AWS recipients | AWS SES |
| **18**| `publishWorkflow.js` | Sender validation (L15) | Publish-time workflow validation | N/A | N/A |
| **19**| `README.md` (workflow) | Documentation (L104) | Architecture documentation | N/A | N/A |

---

## 4. Other Email Senders in the Codebase (Direct `sendGraphEmail` Callers)

While the 19 files above correspond directly to `sendEmail`, several other controllers bypass `sendEmail` and invoke **`sendGraphEmail`** directly:

1. **Authentication & Password Resets**:
   * [`controllers/userAuthController.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/controllers/userAuthController.js#L278): Sends password reset OTPs / verification codes to registered mobile/web users.
2. **Program Offer Letters**:
   * [`controllers/programOfferController.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/controllers/programOfferController.js#L252): Dispatches official cohort acceptance offer letters to students via `akhil@theproductspace.in`.
3. **Free Resources / Book Downloads**:
   * [`controllers/resourceController.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/controllers/resourceController.js#L148): Delivers download links for guides, templates, and ebooks to requesting users.
4. **Certificates of Completion**:
   * [`controllers/courses/courseCertificateController.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/controllers/courses/courseCertificateController.js#L146) & [`controllers/eventCertificateController.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/controllers/eventCertificateController.js#L266): Sends course graduation and event attendance certificates to students.
5. **Scheduled Event Reminder Cron**:
   * [`jobs/eventEmailScheduler.js`](file:///d:/Projects/The%20Product%20Space/tps-next-backend/jobs/eventEmailScheduler.js#L109): Agenda worker that periodically checks for scheduled event reminder templates and dispatches them to guests.
