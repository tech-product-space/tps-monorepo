# Email Send Locations & Call Details

This document catalogs every location where the backend's core email-sending function (`sendMail`) is invoked, explaining the trigger reason, the target recipient, the sender identity, and the exact line number.

---

## 1. Authentication & Account Management

### 1.1 Forgot Password Reset Link
* **File Name**: [`src/controllers/auth/password.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/auth/password.controller.js)
* **Line No**: 55
* **Why Called**: Triggered when a registered user requests a password reset link from the login/auth page. Generates a signed 15-minute JWT reset token and sends the password reset link.
* **For Which Users**: Registered end users who requested to reset their account password (`user.email`).
* **Sender Identity**: Falls back to `DEFAULT_SENDER_EMAIL` (`info@gradientlearnings.org`).

---

## 2. Admin Management

### 2.1 Admin Panel Invitation
* **File Name**: [`src/services/admin/adminEmail.service.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/services/admin/adminEmail.service.js)
* **Line No**: 70
* **Why Called**: Triggered when a super admin creates a new admin user or resends an invitation. It generates a signed invite token and emails an onboarding link to access the Gradient admin panel.
* **For Which Users**: Newly created internal staff/admin members (`admin.email`).
* **Sender Identity**: Pinned to `noreply@gradientlearnings.org` (`GD_NORP_MAIL`).

### 2.2 Admin Password Reset
* **File Name**: [`src/services/admin/adminEmail.service.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/services/admin/adminEmail.service.js)
* **Line No**: 102
* **Why Called**: Triggered when an admin password reset is initiated from the admin portal. Sends a secure reset link valid for 2 hours.
* **For Which Users**: Existing admin staff members (`admin.email`).
* **Sender Identity**: Pinned to `noreply@gradientlearnings.org` (`GD_NORP_MAIL`).

### 2.3 Admin Temporary Password Notification
* **File Name**: [`src/services/admin/adminEmail.service.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/services/admin/adminEmail.service.js)
* **Line No**: 134
* **Why Called**: Triggered when an admin user is provisioned with or has their password reset to an auto-generated temporary password, sending them their credentials and panel login link.
* **For Which Users**: Admin staff members (`admin.email`).
* **Sender Identity**: Pinned to `noreply@gradientlearnings.org` (`GD_NORP_MAIL`).

---

## 3. Events & Guest Management

### 3.1 Guest Registration – Waitlist Notification
* **File Name**: [`src/controllers/eventGuest/crud.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/eventGuest/crud.controller.js)
* **Line No**: 168
* **Why Called**: Triggered immediately when a guest registers for an event whose capacity is full or requires review, placing the attendee on the waitlist.
* **For Which Users**: The registering event attendee (`email`).
* **Sender Identity**: `DEFAULT_SENDER_EMAIL` (`info@gradientlearnings.org`).

### 3.2 Guest Registration – Approved / Direct Registration (With Calendar Invite)
* **File Name**: [`src/controllers/eventGuest/crud.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/eventGuest/crud.controller.js)
* **Line No**: 188
* **Why Called**: Triggered when a guest registers for an open/free event and is instantly approved or registered. Attaches a generated `invite.ics` calendar file.
* **For Which Users**: The registering event attendee (`email`).
* **Sender Identity**: `DEFAULT_SENDER_EMAIL` (`info@gradientlearnings.org`).

### 3.3 Event Guest Status Update (Individual)
* **File Name**: [`src/controllers/eventGuest/crud.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/eventGuest/crud.controller.js)
* **Line No**: 357
* **Why Called**: Triggered when an admin manually updates an individual guest's status (e.g., moves them from waitlist to approved, or declines). If approved, generates and attaches an `.ics` calendar invitation.
* **For Which Users**: The individual event guest (`guest.email`).
* **Sender Identity**: `DEFAULT_SENDER_EMAIL` (`info@gradientlearnings.org`).

### 3.4 Bulk Event Guest Status Update
* **File Name**: [`src/controllers/eventGuest/crud.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/eventGuest/crud.controller.js)
* **Line No**: 483
* **Why Called**: Triggered when an admin approves or updates attendees in bulk from the admin dashboard. Each approved recipient receives their confirmation and `.ics` calendar invite.
* **For Which Users**: Every selected event guest (`guest.email`).
* **Sender Identity**: `DEFAULT_SENDER_EMAIL` (`info@gradientlearnings.org`).

### 3.5 Bulk Referral Guests Approval
* **File Name**: [`src/controllers/eventGuest/referral.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/eventGuest/referral.controller.js)
* **Line No**: 457
* **Why Called**: Triggered when an admin bulk-approves attendees who registered via referral invitations, sending confirmation with an `.ics` calendar file.
* **For Which Users**: Approved referred event attendees (`guest.email`).
* **Sender Identity**: `DEFAULT_SENDER_EMAIL` (`info@gradientlearnings.org`).

### 3.6 Scheduled Event Reminders (Background Job)
* **File Name**: [`src/jobs/eventReminderJob.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/jobs/eventReminderJob.js)
* **Line No**: 175
* **Why Called**: Triggered by the background worker (Agenda) on a schedule (e.g. 24h or 1h before an event) to remind attendees about an upcoming event.
* **For Which Users**: Confirmed/approved attendees of the upcoming event (`guest.email`).
* **Sender Identity**: Pinned per template (`template.senderEmail`).

---

## 4. Certificates & Course Management

### 4.1 Free Course Completion Certificate
* **File Name**: [`src/services/freeCourse/certificateIssue.service.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/services/freeCourse/certificateIssue.service.js)
* **Line No**: 253
* **Why Called**: Triggered when a learner completes a free course and the completion certificate is generated and issued.
* **For Which Users**: The learner/student (`certificate.recipientEmail`).
* **Sender Identity**: Pinned to `noreply@gradientlearnings.org` (`GD_NORP_MAIL`).

### 4.2 Event Attendance Certificate
* **File Name**: [`src/services/event/certificateIssue.service.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/services/event/certificateIssue.service.js)
* **Line No**: 201
* **Why Called**: Triggered when certificates are generated and issued to attendees after completing or attending an event or workshop.
* **For Which Users**: Event attendee (`certificate.recipientEmail`).
* **Sender Identity**: Pinned to `noreply@gradientlearnings.org` (`GD_NORP_MAIL`).

### 4.3 Course Transactional Mail (Enrollment / Brochure)
* **File Name**: [`src/services/course/courseEmail.service.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/services/course/courseEmail.service.js)
* **Line No**: 94
* **Why Called**: Triggered when an enrollment acknowledgement or course brochure/curriculum information is requested.
* **For Which Users**: Prospective or enrolled students (`recipients`).
* **Sender Identity**: `COURSE_FROM_EMAIL` = `DEFAULT_SENDER_EMAIL` (`info@gradientlearnings.org`).

---

## 5. Projects & Lead Magnet Resources

### 5.1 Project Download Link Delivery
* **File Name**: [`src/services/project/projectEmail.service.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/services/project/projectEmail.service.js)
* **Line No**: 138
* **Why Called**: Triggered when a user requests to download project assets/source code, delivering the download link to their inbox.
* **For Which Users**: User/lead requesting the project assets (`lead.email`).
* **Sender Identity**: Pinned to `noreply@gradientlearnings.org` (`GD_NORP_MAIL`).

### 5.2 Community Project Submission Acknowledgement
* **File Name**: [`src/services/project/projectEmail.service.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/services/project/projectEmail.service.js)
* **Line No**: 199
* **Why Called**: Triggered when a community member submits a portfolio/project for review, confirming receipt of the submission.
* **For Which Users**: Project submitter (`project.submitter.email`).
* **Sender Identity**: Pinned to `noreply@gradientlearnings.org` (`GD_NORP_MAIL`).

### 5.3 Resource Lead Capture (E-books, Cheat Sheets, Guides)
* **File Name**: [`src/controllers/resource/lead.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/resource/lead.controller.js)
* **Line No**: 55
* **Why Called**: Triggered when a visitor fills out a lead generation form to download a gated educational resource or guide.
* **For Which Users**: Lead / website visitor (`email`).
* **Sender Identity**: Falls back to `DEFAULT_SENDER_EMAIL` (`info@gradientlearnings.org`).

---

## 6. Marketing Campaigns & Automation Workflows

### 6.1 Marketing Campaign Broadcast (Background Chunk Dispatcher)
* **File Name**: [`src/jobs/campaignSendJob.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/jobs/campaignSendJob.js)
* **Line No**: 273
* **Why Called**: Executed by BullMQ background workers to batch send promotional or informational marketing campaigns to audience segments. Checks suppression lists before dispatching.
* **For Which Users**: Targeted campaign audience members / subscribers (`recipient.email`).
* **Sender Identity**: Configured per campaign (`campaign.senderEmail`).

### 6.2 Automation Workflow Step Dispatcher
* **File Name**: [`src/services/workflow/dispatch/emailDispatcher.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/services/workflow/dispatch/emailDispatcher.js)
* **Line No**: 57
* **Why Called**: Executed by the workflow automation worker when an enrolled contact reaches an "Email" action node in a drip sequence or automated lifecycle workflow.
* **For Which Users**: Enrolled workflow contacts / leads (`to`).
* **Sender Identity**: Configured on workflow node (`config.senderEmail`).

---

## 7. Operational & System Alerts

### 7.1 Meta / Facebook Token Expiration Alert
* **File Name**: [`src/services/meta/metaAlert.service.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/services/meta/metaAlert.service.js)
* **Line No**: 57
* **Why Called**: Triggered when a Facebook lead integration access token expires or is invalidated, halting lead import.
* **For Which Users**: Operations / Technical Admins (`env.meta.alertEmail`).
* **Sender Identity**: Pinned to `noreply@gradientlearnings.org` (`GD_NORP_MAIL`).

---

## 8. Admin Panel Test / Preview Sends

These endpoints are triggered manually by administrators to preview and verify template appearance, variable interpolation, and inbox deliverability before publishing to users.

### 8.1 Automation Workflow Test Send
* **File Name**: [`src/controllers/workflow/crud.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/workflow/crud.controller.js)
* **Line No**: 431
* **Why Called**: Admin tests a workflow email step with sample context before activating the workflow.
* **For Which Users**: Admin / Tester specified destination email (`to`).
* **Sender Identity**: Configured per workflow step (`config.senderEmail`).

### 8.2 Project Email Template Test Send
* **File Name**: [`src/controllers/project/emailTemplate.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/project/emailTemplate.controller.js)
* **Line No**: 254
* **Why Called**: Admin sends a sample download or submission acknowledgement email to check formatting.
* **For Which Users**: Admin / Tester specified email (`to`).
* **Sender Identity**: Pinned to `noreply@gradientlearnings.org` (`GD_NORP_MAIL`).

### 8.3 Event Reminder Test Send
* **File Name**: [`src/controllers/event/eventReminder.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/event/eventReminder.controller.js)
* **Line No**: 355
* **Why Called**: Admin tests an upcoming event reminder email template before scheduling it.
* **For Which Users**: Admin / Tester specified email (`to`).
* **Sender Identity**: Configured on the reminder (`reminder.senderEmail`).

### 8.4 Event Email Template Test Send
* **File Name**: [`src/controllers/event/emailTemplate.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/event/emailTemplate.controller.js)
* **Line No**: 209
* **Why Called**: Admin previews event waitlist, registration confirmation, or certificate templates with sample data.
* **For Which Users**: Admin / Tester specified email (`to`).
* **Sender Identity**: Pinned to `noreply@gradientlearnings.org` for certificates, or `DEFAULT_SENDER_EMAIL` for guest emails.

### 8.5 Free Course Certificate Template Test Send
* **File Name**: [`src/controllers/freeCourseCertificate/email.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/freeCourseCertificate/email.controller.js)
* **Line No**: 169
* **Why Called**: Admin sends a test certificate email with sample certificate numbers and student names.
* **For Which Users**: Admin / Tester specified email (`to`).
* **Sender Identity**: Pinned to `noreply@gradientlearnings.org` (`GD_NORP_MAIL`).

### 8.6 Marketing Campaign Test Send
* **File Name**: [`src/controllers/campaign/send.controller.js`](file:///d:/Projects/The%20Product%20Space/gradient-backend/src/controllers/campaign/send.controller.js)
* **Line No**: 209
* **Why Called**: Admin sends a draft campaign preview email to verify formatting before launching to the entire recipient list.
* **For Which Users**: Admin / Tester specified email (`to`).
* **Sender Identity**: Configured on campaign (`campaign.senderEmail`).
