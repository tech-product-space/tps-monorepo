/**
 * Manual script — `node src/test/certificateAutoIssue.test.js`
 *
 * Phase 4: the automatic trigger. A feedback submission should issue
 * certificates to the submitter and every teammate they named, with no admin
 * in the loop — and should do *nothing at all* when the event is not set up
 * for it.
 *
 * Creates its own event and tears everything down at the end.
 *
 * **No email leaves the machine.** `initEmailProviders()` is never called in a
 * standalone script, so the transport list is empty and `sendMail` fails
 * closed. That is asserted rather than assumed — a certificate that reached a
 * real inbox from a test run would be worse than a failing test.
 */
import { createCanvas } from "@napi-rs/canvas";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import db from "../database/postgres/models/index.js";
import s3 from "../config/awsS3.js";
import { putObject } from "../util/s3.js";
import { initCertificateFonts } from "../services/event/certificateFonts.js";
import {
  autoIssueForFeedback,
  certificateReadiness,
} from "../services/event/certificateAutoIssue.service.js";
import {
  EVENT_CERTIFICATE_APPROVED_VIA,
  EVENT_CERTIFICATE_STATUS,
} from "../config/constants/eventCertificate.js";
import { EVENT_EMAIL_TEMPLATE_TYPE } from "../config/constants/event.js";
import { EVENT_GUEST_STATUS } from "../config/constants/eventGuest.js";
import { settleCertificates } from "./support/settleCertificates.js";

const {
  Event,
  EventGuest,
  EventFeedback,
  EventCertificate,
  EventCertificateTemplate,
  EventEmailTemplate,
} = db;

const W = 1600;
const H = 1131;

let passed = 0;
let failed = 0;

const ok = (label, condition, detail = "") => {
  condition ? passed++ : failed++;
  console.log(
    `  ${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
};

const makeBackground = () => {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f3ea";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 14;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  return canvas.toBuffer("image/png");
};

const countCertificates = (eventId) =>
  EventCertificate.count({ where: { eventId } });

/**
 * Issuing is fire-and-forget by design — the submit handler must not wait on a
 * render, an upload and a mail round trip. So the test waits instead, and works
 * under either queue mode. See the helper for why.
 */
const waitForIssuance = (eventId) => settleCertificates(eventId);

const run = async () => {
  initCertificateFonts();

  const stamp = Date.now();
  const backgroundKey = `tmp/auto-issue-test-${stamp}.png`;
  const createdFileKeys = [];

  const event = await Event.create({
    eventTitle: `Auto Issue Test ${stamp}`,
    eventSlug: `auto-issue-test-${stamp}`,
    eventType: "Hackathon",
    eventCategory: "Normal",
    canAcceptResponse: true,
    // Off to begin with, so the first case is the one that must create nothing.
    settings: { autoIssueCertificate: false },
  });

  try {
    const submitter = await EventGuest.create({
      eventId: event.id,
      name: "Rahul Verma",
      email: `rahul-${stamp}@example.com`,
      phone: "9999900001",
      attendeeType: "Professional",
      role: "PM",
      status: EVENT_GUEST_STATUS.APPROVED,
    });

    const aisha = await EventGuest.create({
      eventId: event.id,
      name: "Aisha Khan",
      email: `aisha-${stamp}@example.com`,
      phone: "9999900002",
      attendeeType: "Professional",
      role: "Designer",
      status: EVENT_GUEST_STATUS.APPROVED,
    });

    const feedback = await EventFeedback.create({
      eventId: event.id,
      guestId: submitter.id,
      responses: {
        teamName: "Nova",
        teamMembers: [
          { name: "Aisha Khan", email: aisha.email },
          // Never registered — must still get one.
          { name: "Dev Menon", email: `dev-${stamp}@example.com` },
        ],
        demoVideoUrl: "https://youtu.be/abc123",
      },
      submittedAt: new Date(),
    });

    console.log("\n1. Switched off");
    const off = await autoIssueForFeedback(feedback, event, submitter);
    ok("status is off", off.status === "off", off.status);
    ok("nothing created", (await countCertificates(event.id)) === 0);

    console.log("\n2. On, but the event has neither a design nor an email");
    await event.update({ settings: { autoIssueCertificate: true } });

    const bare = await autoIssueForFeedback(feedback, event, submitter);
    ok("status is not_ready", bare.status === "not_ready", bare.status);
    ok(
      "both pieces reported missing",
      bare.missing?.includes("template") && bare.missing?.includes("email"),
      (bare.missing || []).join(", "),
    );
    ok("still nothing created", (await countCertificates(event.id)) === 0);

    console.log("\n3. Design saved, email still missing");
    await putObject({
      key: backgroundKey,
      body: makeBackground(),
      contentType: "image/png",
      isPrivate: true,
    });

    await EventCertificateTemplate.create({
      eventId: event.id,
      name: "Certificate of Participation",
      backgroundKey,
      canvasWidth: W,
      canvasHeight: H,
      fields: [
        { key: "recipientName", x: 50, y: 46, fontSize: 64, color: "#111111", align: "center", fontWeight: "bold", maxWidth: 70 },
        { key: "eventTitle", x: 50, y: 60, fontSize: 28, color: "#444444", align: "center" },
        { key: "issuedDate", x: 25, y: 86, fontSize: 20, color: "#666666", align: "center" },
        { key: "certificateNo", x: 75, y: 86, fontSize: 16, color: "#999999", align: "center" },
      ],
    });

    const noEmail = await autoIssueForFeedback(feedback, event, submitter);
    ok("still not_ready", noEmail.status === "not_ready", noEmail.status);
    ok(
      "only the email is missing now",
      noEmail.missing?.length === 1 && noEmail.missing[0] === "email",
      (noEmail.missing || []).join(", "),
    );
    // The decision this whole branch exists for: no email means no certificate
    // rows at all, rather than Issued rows nobody sent.
    ok(
      "NOTHING is created without an email — not even unsent rows",
      (await countCertificates(event.id)) === 0,
    );

    console.log("\n4. Readiness, as the admin sees it");
    const readiness = await certificateReadiness(event);
    ok("hasTemplate true", readiness.hasTemplate === true);
    ok("hasEmailTemplate false", readiness.hasEmailTemplate === false);
    ok("not ready overall", readiness.ready === false);

    console.log("\n5. Email saved — the trigger should now fire");
    await EventEmailTemplate.create({
      eventId: event.id,
      type: EVENT_EMAIL_TEMPLATE_TYPE.CERTIFICATE,
      subject: "Your {{eventTitle}} certificate",
      body: "Hi {{name}}, your certificate ({{certificateNo}}) is ready. Sign in to download it.",
    });

    const ready = await certificateReadiness(event);
    ok("readiness now true", ready.ready === true);

    const fired = await autoIssueForFeedback(feedback, event, submitter);
    ok("status is issuing", fired.status === "issuing", fired.status);
    ok("three recipients created", fired.created === 3, `created ${fired.created}`);
    ok(
      "recipient list names everyone, submitter included",
      fired.recipients.length === 3 &&
        fired.recipients.some((r) => r.email === submitter.email) &&
        fired.recipients.some((r) => r.email.startsWith("dev-")),
      fired.recipients.map((r) => r.name).join(", "),
    );
    ok(
      "the unregistered teammate is in the list, not dropped",
      fired.recipients.some((r) => r.email === `dev-${stamp}@example.com`),
    );

    const rows = await EventCertificate.findAll({
      where: { eventId: event.id },
      order: [["recipientEmail", "ASC"]],
    });

    ok(
      "all approved via Auto",
      rows.every((c) => c.approvedVia === EVENT_CERTIFICATE_APPROVED_VIA.AUTO),
    );
    ok(
      "approvedBy is null — that is how an auto row is told apart",
      rows.every((c) => c.approvedBy === null),
    );
    ok(
      "each certificate is tied back to the submission that earned it",
      rows.every((c) => c.sourceFeedbackId === feedback.id),
    );

    console.log("\n6. The queued work actually runs");
    const settled = await waitForIssuance(event.id);
    ok("issuance finished within the timeout", settled);

    const issued = await EventCertificate.findAll({
      where: { eventId: event.id },
      order: [["recipientEmail", "ASC"]],
    });
    issued.forEach((c) => c.fileKey && createdFileKeys.push(c.fileKey));

    ok(
      "all three Issued",
      issued.every((c) => c.status === EVENT_CERTIFICATE_STATUS.ISSUED),
      issued.map((c) => `${c.recipientEmail.split("@")[0]}:${c.status}`).join(", "),
    );
    ok("all have a stored fileKey", issued.every((c) => !!c.fileKey));
    ok(
      "emailSentAt null — no transport is registered in a script, so nothing was sent",
      issued.every((c) => c.emailSentAt === null),
    );

    console.log("\n7. Running the trigger again changes nothing");
    const replay = await autoIssueForFeedback(feedback, event, submitter);
    ok("still reports issuing", replay.status === "issuing", replay.status);
    ok("but creates nothing new", replay.created === 0, `created ${replay.created}`);
    ok("row count unchanged", (await countCertificates(event.id)) === 3);

    const afterReplay = await EventCertificate.findAll({
      where: { eventId: event.id },
      attributes: ["status", "attempts"],
    });
    ok(
      "existing certificates left alone",
      afterReplay.every(
        (c) => c.status === EVENT_CERTIFICATE_STATUS.ISSUED && c.attempts === 1,
      ),
    );

    console.log("\n8. A row an admin is holding is not swept up");
    // A Pending row exists only because an admin created it and has not
    // approved it. A late submission must not approve it on their behalf.
    await EventCertificate.destroy({ where: { eventId: event.id } });
    await EventCertificate.create({
      eventId: event.id,
      guestId: submitter.id,
      certificateNo: `GRD-2026-HOLD${String(stamp).slice(-4)}`,
      recipientName: submitter.name,
      recipientEmail: submitter.email,
      source: "Attendee",
      status: EVENT_CERTIFICATE_STATUS.PENDING,
      approvedVia: EVENT_CERTIFICATE_APPROVED_VIA.ADMIN,
    });

    const held = await autoIssueForFeedback(feedback, event, submitter);
    ok("the other two are created", held.created === 2, `created ${held.created}`);

    await waitForIssuance(event.id);

    const heldRow = await EventCertificate.findOne({
      where: { eventId: event.id, recipientEmail: submitter.email },
    });
    ok(
      "the admin's Pending row is still Pending",
      heldRow.status === EVENT_CERTIFICATE_STATUS.PENDING,
      heldRow.status,
    );
    ok(
      "and still Admin, not rewritten to Auto",
      heldRow.approvedVia === EVENT_CERTIFICATE_APPROVED_VIA.ADMIN,
    );

    const finals = await EventCertificate.findAll({ where: { eventId: event.id } });
    finals.forEach((c) => c.fileKey && createdFileKeys.push(c.fileKey));
  } finally {
    console.log("\nCleaning up…");

    await EventCertificate.destroy({ where: { eventId: event.id } });
    await EventFeedback.destroy({ where: { eventId: event.id } });
    await EventCertificateTemplate.destroy({ where: { eventId: event.id } });
    await EventEmailTemplate.destroy({ where: { eventId: event.id } });
    await EventGuest.destroy({ where: { eventId: event.id } });
    await event.destroy();

    for (const key of [...new Set([backgroundKey, ...createdFileKeys])].filter(Boolean)) {
      await s3
        .send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: key }))
        .catch(() => {});
    }

    console.log(`\n${passed} passed, ${failed} failed.\n`);
  }
};

run()
  .then(() => process.exit(failed ? 1 : 0))
  .catch((error) => {
    console.error("\nFAILED:", error);
    process.exit(1);
  });
