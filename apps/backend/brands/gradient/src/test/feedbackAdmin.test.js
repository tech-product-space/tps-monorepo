/**
 * Manual script — `node src/test/feedbackAdmin.test.js`
 *
 * Covers the admin Feedback tab's two new powers:
 *
 *   1. search   — find a response by the submitter OR by a teammate named on it
 *   2. generate — approve and queue certificates straight from a response
 *
 * plus the certificate lookup that replaced it on the Certificates tab, and
 * revoke/restore.
 *
 * Controllers are called directly with stub req/res objects; there is no HTTP
 * server and no admin token involved. Certificates are really rendered and
 * really uploaded, so this creates its own event with a real template and tears
 * the whole thing down afterwards.
 *
 * **Sends no email.** The event has no Certificate email template, so
 * sendCertificateEmail returns early.
 */
import { createCanvas } from "@napi-rs/canvas";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import db from "../database/postgres/models/index.js";
import s3 from "../config/awsS3.js";
import { putObject } from "../util/s3.js";
import { initCertificateFonts } from "../services/event/certificateFonts.js";
import { listFeedbacks } from "../controllers/eventFeedback/admin.controller.js";
import {
  correctRecipient,
  issueForFeedbacks,
  listCertificates,
  restoreCertificate,
  revokeCertificate,
} from "../controllers/eventCertificate/issue.controller.js";
import { EVENT_CERTIFICATE_STATUS } from "../config/constants/eventCertificate.js";
import { EVENT_GUEST_STATUS } from "../config/constants/eventGuest.js";
import { settleCertificates } from "./support/settleCertificates.js";

const {
  AdminUser,
  Event,
  EventGuest,
  EventFeedback,
  EventCertificate,
  EventCertificateTemplate,
} = db;

/**
 * A real admin id, because `approvedBy` is a foreign key — an invented one is
 * rejected by the database, which is itself the guarantee that a certificate's
 * approver is somebody who exists. Filled in at the top of the run.
 */
let adminId = null;

const W = 1200;
const H = 850;

let passed = 0;
let failed = 0;

const ok = (label, condition, detail = "") => {
  if (condition) passed += 1;
  else failed += 1;
  console.log(
    `  ${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
};

/**
 * Minimal Express doubles — enough for `res.status(n).json(body)`.
 *
 * Resolved by the response, not by the call: `asyncWrapper` does not return the
 * handler's promise (it only attaches a `.catch`), so awaiting the controller
 * itself would come back before it had done anything.
 */
const call = (controller, { params = {}, query = {}, body = {} }) =>
  new Promise((resolve, reject) => {
    let statusCode = 200;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resolve({ statusCode, ...data });
        return this;
      },
    };

    controller({ params, query, body, admin: { id: adminId } }, res, reject);
  });

/**
 * Wait for the certificates to actually render.
 *
 * Issuing is deliberately off-request — the endpoint returns while the rows are
 * still `Approved`. Asserting `Issued` synchronously would only prove the queue
 * happened to be fast.
 */
const waitForIssued = async (eventId) => {
  await settleCertificates(eventId);
  return EventCertificate.findAll({ where: { eventId } });
};

const makeBackground = () => {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  return canvas.toBuffer("image/png");
};

const run = async () => {
  initCertificateFonts();

  const admin = await AdminUser.findOne({ attributes: ["id"] });

  if (!admin) {
    console.error("No admin user in this database — nothing can be approved.");
    process.exit(1);
  }

  adminId = admin.id;

  const stamp = Date.now();
  const backgroundKey = `tmp/feedback-admin-test-${stamp}.png`;
  const fileKeys = [];

  const event = await Event.create({
    eventTitle: `Feedback Admin Test ${stamp}`,
    eventSlug: `feedback-admin-test-${stamp}`,
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
      name: "Participation",
      backgroundKey,
      canvasWidth: W,
      canvasHeight: H,
      fields: [
        { key: "recipientName", x: 50, y: 45, fontSize: 48, color: "#111" },
        { key: "certificateNo", x: 50, y: 90, fontSize: 14, color: "#999" },
      ],
    });

    const meera = await EventGuest.create({
      eventId: event.id,
      name: "Meera Iyer",
      email: `meera-${stamp}@example.com`,
      phone: "9999900011",
      attendeeType: "Professional",
      role: "Engineer",
      status: EVENT_GUEST_STATUS.APPROVED,
    });

    const sameer = await EventGuest.create({
      eventId: event.id,
      name: "Sameer Rao",
      email: `sameer-${stamp}@example.com`,
      phone: "9999900012",
      attendeeType: "Professional",
      role: "Analyst",
      status: EVENT_GUEST_STATUS.APPROVED,
    });

    const declined = await EventGuest.create({
      eventId: event.id,
      name: "Declined Person",
      email: `declined-${stamp}@example.com`,
      phone: "9999900013",
      attendeeType: "Professional",
      role: "Student",
      status: EVENT_GUEST_STATUS.DECLINED,
    });

    // Meera's team names Farhan, who never registered. That is the case search
    // has to find: Farhan exists only inside somebody else's submission.
    const meeraFeedback = await EventFeedback.create({
      eventId: event.id,
      guestId: meera.id,
      responses: {
        teamName: "Kite",
        teamMembers: [
          {
            name: "Farhan Qureshi",
            email: `farhan-${stamp}@example.com`,
            phone: "9812345678",
            countryCode: "+91",
          },
        ],
        demoVideoUrl: "https://youtu.be/kite",
      },
      submittedAt: new Date(),
    });

    await EventFeedback.create({
      eventId: event.id,
      guestId: sameer.id,
      responses: { teamName: "Solo", teamMembers: [] },
      submittedAt: new Date(),
    });

    const declinedFeedback = await EventFeedback.create({
      eventId: event.id,
      guestId: declined.id,
      responses: {
        teamName: "Ghost",
        teamMembers: [
          { name: "Ghost Teammate", email: `ghost-${stamp}@example.com` },
        ],
      },
      submittedAt: new Date(),
    });

    console.log("\n1. List, unfiltered");
    const all = await call(listFeedbacks, { params: { eventId: event.id } });
    ok("three responses", all.meta.total === 3, `total ${all.meta.total}`);

    const meeraRow = all.data.find((f) => f.id === meeraFeedback.id);
    ok(
      "recipients = submitter + teammate",
      meeraRow.recipients.length === 2,
      meeraRow.recipients.map((r) => r.name).join(", "),
    );
    ok(
      "submitter is the Attendee row",
      meeraRow.recipients.find((r) => r.email === meera.email)?.source ===
        "Attendee",
    );
    ok(
      "teammate carries who named them",
      meeraRow.recipients.find((r) => r.source === "Teammate")?.namedBy ===
        "Meera Iyer",
    );
    ok(
      "nobody has a certificate yet",
      meeraRow.certificateSummary.none === 2 &&
        meeraRow.certificateSummary.issued === 0,
      JSON.stringify(meeraRow.certificateSummary),
    );
    ok(
      "teammate phone and country code survive to the admin",
      meeraRow.teammates[0]?.phone === "9812345678" &&
        meeraRow.teammates[0]?.countryCode === "+91",
    );

    console.log("\n2. Search");
    const bySubmitter = await call(listFeedbacks, {
      params: { eventId: event.id },
      query: { search: "meera" },
    });
    ok(
      "finds the submitter by name",
      bySubmitter.meta.total === 1 &&
        bySubmitter.data[0].id === meeraFeedback.id,
      `total ${bySubmitter.meta.total}`,
    );

    const byEmail = await call(listFeedbacks, {
      params: { eventId: event.id },
      query: { search: `sameer-${stamp}` },
    });
    ok("finds the submitter by email", byEmail.meta.total === 1);

    // The whole reason the JSONB arm exists.
    const byTeammate = await call(listFeedbacks, {
      params: { eventId: event.id },
      query: { search: "farhan" },
    });
    ok(
      "finds a response by a teammate named on it",
      byTeammate.meta.total === 1 &&
        byTeammate.data[0].id === meeraFeedback.id,
      `total ${byTeammate.meta.total}`,
    );

    const noise = await call(listFeedbacks, {
      params: { eventId: event.id },
      query: { search: "nobody-by-that-name" },
    });
    ok("a miss returns nothing", noise.meta.total === 0);

    const injection = await call(listFeedbacks, {
      params: { eventId: event.id },
      query: { search: "%' OR 1=1 --" },
    });
    ok(
      "the search term is bound, not interpolated",
      injection.meta.total === 0,
      `total ${injection.meta.total}`,
    );

    console.log("\n3. Generate from one response");
    const issued = await call(issueForFeedbacks, {
      params: { eventId: event.id },
      body: { feedbackIds: [meeraFeedback.id] },
    });
    ok(
      "two certificates created and queued",
      issued.data.created === 2 && issued.data.queued === 2,
      JSON.stringify(issued.data),
    );

    const rows = await waitForIssued(event.id);
    rows.forEach((row) => row.fileKey && fileKeys.push(row.fileKey));

    ok(
      "credited to the admin who pressed it",
      rows.every((r) => r.approvedVia === "Admin" && r.approvedBy === adminId),
      rows.map((r) => `${r.approvedVia}/${r.approvedBy}`).join(", "),
    );
    ok(
      "rendered and issued off-request",
      rows.every((r) => r.status === EVENT_CERTIFICATE_STATUS.ISSUED),
      rows.map((r) => r.status).join(", "),
    );

    console.log("\n4. Pressing it again");
    const replay = await call(issueForFeedbacks, {
      params: { eventId: event.id },
      body: { feedbackIds: [meeraFeedback.id] },
    });
    ok(
      "nothing created, nothing re-queued",
      replay.data.created === 0 && replay.data.queued === 0,
      JSON.stringify(replay.data),
    );
    ok(
      "the already-issued pair is reported as skipped",
      replay.data.skipped === 2,
    );

    const afterReplay = await EventCertificate.count({
      where: { eventId: event.id },
    });
    ok("still two certificate rows", afterReplay === 2, `${afterReplay} rows`);

    console.log("\n5. A declined submitter");
    const declinedRun = await call(issueForFeedbacks, {
      params: { eventId: event.id },
      body: { feedbackIds: [declinedFeedback.id] },
    });
    ok(
      "creates nothing for a declined guest's team",
      declinedRun.data.created === 0 && declinedRun.data.skippedDeclined === 1,
      JSON.stringify(declinedRun.data),
    );

    console.log("\n6. Generate for everyone");
    const bulk = await call(issueForFeedbacks, {
      params: { eventId: event.id },
      body: { all: true },
    });
    ok(
      "picks up only Sameer, who had none",
      bulk.data.created === 1,
      JSON.stringify(bulk.data),
    );
    ok("still skips the declined response", bulk.data.skippedDeclined === 1);

    const finalRows = await waitForIssued(event.id);
    finalRows.forEach((row) => row.fileKey && fileKeys.push(row.fileKey));
    ok("three certificates in total", finalRows.length === 3);

    console.log("\n7. The list reflects it");
    const after = await call(listFeedbacks, { params: { eventId: event.id } });
    const meeraAfter = after.data.find((f) => f.id === meeraFeedback.id);
    ok(
      "both of Meera's team show Issued",
      meeraAfter.certificateSummary.issued === 2 &&
        meeraAfter.certificateSummary.none === 0,
      JSON.stringify(meeraAfter.certificateSummary),
    );
    ok(
      "each recipient carries their certificate number",
      meeraAfter.recipients.every((r) => !!r.certificate?.certificateNo),
    );

    console.log("\n8. Certificate lookup");
    const found = await call(listCertificates, {
      params: { eventId: event.id },
      query: { search: "farhan" },
    });
    ok(
      "finds a certificate by recipient",
      found.data.length === 1 &&
        found.data[0].recipientEmail.startsWith("farhan-"),
      `${found.data.length} row(s)`,
    );

    const byNumber = await call(listCertificates, {
      params: { eventId: event.id },
      query: { search: finalRows[0].certificateNo.slice(-6) },
    });
    ok("finds one by part of its number", byNumber.data.length === 1);

    ok(
      "counts stay event-wide, not search-scoped",
      (byNumber.counts.Issued || 0) === 3,
      JSON.stringify(byNumber.counts),
    );

    console.log("\n9. Revoke and restore");
    const target = finalRows[0];

    await call(revokeCertificate, { params: { id: target.id } });
    await target.reload();
    ok("revoked", target.status === EVENT_CERTIFICATE_STATUS.REVOKED);

    const restored = await call(restoreCertificate, {
      params: { id: target.id },
    });
    await target.reload();
    ok(
      "restored to Issued — the file was never deleted",
      restored.data.status === EVENT_CERTIFICATE_STATUS.ISSUED &&
        target.status === EVENT_CERTIFICATE_STATUS.ISSUED,
      target.status,
    );
    ok(
      "and keeps the number the recipient already has",
      target.certificateNo === finalRows[0].certificateNo,
    );

    const notRevoked = await call(restoreCertificate, {
      params: { id: target.id },
    });
    ok(
      "restoring one that is not revoked is refused",
      notRevoked.statusCode === 400,
      `status ${notRevoked.statusCode}`,
    );

    // Correcting an issued certificate revokes it and mints a replacement.
    // Restoring the original afterwards would leave two live certificates for
    // one person, which is what the guard is for.
    //
    // The correction changes the *email*: the unique index on
    // (eventId, recipientEmail) is unconditional, so a replacement carrying the
    // same address collides with the row it replaces. See the note in §9 of the
    // plan — correcting a name alone on an Issued certificate fails today.
    await call(correctRecipient, {
      params: { id: target.id },
      body: {
        name: "Meera Iyer-Rao",
        email: `meera-corrected-${stamp}@example.com`,
      },
    });
    await target.reload();

    ok(
      "correcting an issued certificate revokes it",
      target.status === EVENT_CERTIFICATE_STATUS.REVOKED,
      target.status,
    );

    const blocked = await call(restoreCertificate, {
      params: { id: target.id },
    });
    ok(
      "cannot restore one that was replaced",
      blocked.statusCode === 409,
      `status ${blocked.statusCode}`,
    );
  } finally {
    console.log("\nCleaning up…");

    await EventCertificate.destroy({ where: { eventId: event.id } });
    await EventFeedback.destroy({ where: { eventId: event.id } });
    await EventCertificateTemplate.destroy({ where: { eventId: event.id } });
    await EventGuest.destroy({ where: { eventId: event.id } });
    await event.destroy();

    for (const key of [...new Set([backgroundKey, ...fileKeys])].filter(Boolean)) {
      await s3
        .send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
          }),
        )
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
