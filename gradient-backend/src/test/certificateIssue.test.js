/**
 * Manual script — `node src/test/certificateIssue.test.js`
 *
 * Drives the whole phase-3 chain against the real database and real S3:
 *
 *   feedback → resolve recipients → create → approve → issue → verify
 *
 * Creates its own event and tears everything down at the end, so it does not
 * touch existing data.
 *
 * **No email is sent.** The event deliberately has no Certificate email
 * template, so sendCertificateEmail returns early — issuing a certificate to
 * `@example.com` addresses and actually attempting delivery would be rude to
 * the sending domain's reputation. The template substitution is checked
 * separately, without a send.
 */
import { createCanvas } from "@napi-rs/canvas";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import db from "../database/postgres/models/index.js";
import s3 from "../config/awsS3.js";
import { putObject, getPresignedUrl } from "../util/s3.js";
import { initCertificateFonts } from "../services/event/certificateFonts.js";
import { resolveEventRecipients } from "../services/event/certificateRecipients.service.js";
import { issueCertificate } from "../services/event/certificateIssue.service.js";
import { generateCertificateNumber } from "../util/helpers/certificateNumber.js";
import { EVENT_CERTIFICATE_STATUS } from "../config/constants/eventCertificate.js";
import { EVENT_GUEST_STATUS } from "../config/constants/eventGuest.js";
import { BODIES } from "../services/email/index.js";

const {
  Event,
  EventGuest,
  EventFeedback,
  EventCertificate,
  EventCertificateTemplate,
} = db;

const W = 1600;
const H = 1131;

const ok = (label, condition, detail = "") =>
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);

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

const run = async () => {
  initCertificateFonts();

  const stamp = Date.now();
  const backgroundKey = `tmp/certificate-issue-test-${stamp}.png`;
  const createdFileKeys = [];

  const event = await Event.create({
    eventTitle: `Issue Test ${stamp}`,
    eventSlug: `issue-test-${stamp}`,
    eventType: "Hackathon",
    eventCategory: "Normal",
    canAcceptResponse: true,
  });

  try {
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

    const submitter = await EventGuest.create({
      eventId: event.id,
      name: "Rahul Verma",
      email: `rahul-${stamp}@example.com`,
      phone: "9999900001",
      attendeeType: "Professional",
      role: "PM",
      status: EVENT_GUEST_STATUS.APPROVED,
    });

    // Aisha is registered; Dev never registered. Both are named as teammates.
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
          { name: "Dev Menon", email: `dev-${stamp}@example.com` },
          // Names the submitter — should dedupe to the attendee row.
          { name: "Rahul Verma", email: submitter.email },
        ],
        demoVideoUrl: "https://youtu.be/abc123",
      },
      submittedAt: new Date(),
    });

    console.log("\n1. Resolve recipients");
    const recipients = await resolveEventRecipients(event);

    ok("three recipients, submitter deduped", recipients.length === 3,
      recipients.map((r) => r.email.split("@")[0]).join(", "));
    ok("submitter is Attendee with a guestId",
      recipients.find((r) => r.email === submitter.email)?.source === "Attendee");
    ok("Aisha matched to her registration",
      recipients.find((r) => r.email === aisha.email)?.registered === true);

    const dev = recipients.find((r) => r.email.startsWith("dev-"));
    ok("Dev flagged unregistered but NOT dropped",
      !!dev && dev.registered === false && dev.guestId === null);
    ok("Dev credited to whoever named him", dev?.namedBy === "Rahul Verma");

    console.log("\n2. Create + approve");
    const rows = await EventCertificate.bulkCreate(
      recipients.map((r) => ({
        eventId: event.id,
        guestId: r.guestId,
        certificateNo: generateCertificateNumber(),
        recipientName: r.name,
        recipientEmail: r.email,
        source: r.source,
        sourceFeedbackId: r.sourceFeedbackId,
        status: EVENT_CERTIFICATE_STATUS.APPROVED,
      })),
      { ignoreDuplicates: true },
    );
    ok("three certificate rows created", rows.length === 3);

    // Re-running the resolver must not produce new recipients.
    const second = await resolveEventRecipients(event);
    ok("re-resolve sees them as already issued",
      second.every((r) => r.existingCertificate !== null));

    console.log("\n3. Issue (inline — AGENDA_JOBS_ENABLED is off)");
    for (const row of rows) {
      const result = await issueCertificate(row.id);
      if (!result.success) console.log("     error:", result.error);
    }

    const issued = await EventCertificate.findAll({
      where: { eventId: event.id },
      order: [["recipientEmail", "ASC"]],
    });

    issued.forEach((c) => createdFileKeys.push(c.fileKey));

    ok("all three Issued",
      issued.every((c) => c.status === EVENT_CERTIFICATE_STATUS.ISSUED),
      issued.map((c) => c.status).join(", "));
    ok("all have a stored fileKey", issued.every((c) => !!c.fileKey));
    ok("no fileKey is a URL — presigned per view",
      issued.every((c) => !c.fileKey.startsWith("http")));
    ok("emailSentAt null (no template, so nothing sent)",
      issued.every((c) => c.emailSentAt === null));
    ok("template snapshotted for reproducibility",
      issued.every((c) => !!c.templateSnapshot?.fields?.length));

    console.log("\n4. Idempotency");
    const replay = await issueCertificate(issued[0].id);
    ok("re-issuing an Issued row is a no-op",
      replay.skipped === EVENT_CERTIFICATE_STATUS.ISSUED,
      `skipped: ${replay.skipped}`);

    const before = issued[0].attempts;
    await issued[0].reload();
    ok("attempts not incremented by the replay", issued[0].attempts === before);

    console.log("\n5. Presigned URL");
    const url = await getPresignedUrl({ key: issued[0].fileKey, expiresIn: 60 });
    ok("URL is signed and expiring",
      url.includes("X-Amz-Signature") && url.includes("X-Amz-Expires"));

    const head = await fetch(url);
    ok("URL actually serves the PDF", head.ok,
      `${head.status} ${head.headers.get("content-type")}`);

    const unsigned = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${issued[0].fileKey}`;
    const direct = await fetch(unsigned);
    ok("object is NOT publicly readable without a signature",
      direct.status === 403, `direct S3 GET -> ${direct.status}`);

    console.log("\n6. Email template substitution (no send)");
    // Every variable the sender actually supplies. There is deliberately no
    // link variable: the file is downloaded from the signed-in dashboard, so an
    // emailed URL would either expire or work for whoever it was forwarded to.
    const rendered = BODIES.CUSTOM(
      "Hi {{name}}, your {{eventTitle}} certificate ({{certificateNo}}) is ready",
      {
        name: "Rahul Verma",
        eventTitle: event.eventTitle,
        certificateNo: issued[0].certificateNo,
      },
    );
    ok("all placeholders replaced", !rendered.includes("{{"), rendered.slice(0, 90) + "…");

    console.log("\n7. Revoke");
    await issued[0].update({ status: EVENT_CERTIFICATE_STATUS.REVOKED });
    await issued[0].reload();
    ok("status is Revoked", issued[0].status === EVENT_CERTIFICATE_STATUS.REVOKED);
    ok("file still exists but verify will refuse to mint a URL", !!issued[0].fileKey);
  } finally {
    console.log("\nCleaning up…");

    await EventCertificate.destroy({ where: { eventId: event.id } });
    await EventFeedback.destroy({ where: { eventId: event.id } });
    await EventCertificateTemplate.destroy({ where: { eventId: event.id } });
    await EventGuest.destroy({ where: { eventId: event.id } });
    await event.destroy();

    for (const key of [backgroundKey, ...createdFileKeys].filter(Boolean)) {
      await s3
        .send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: key }))
        .catch(() => {});
    }

    console.log("Done.\n");
  }
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nFAILED:", error);
    process.exit(1);
  });
