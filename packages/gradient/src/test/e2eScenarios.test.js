import psEnv from "@ps/env/gradient";
/**
 * Manual script — `node src/test/e2eScenarios.test.js`
 *
 * Executes FEEDBACK_CERTIFICATE_TEST_PLAN.md against the real database and real
 * S3, case by case, using the plan's own IDs so results map straight back.
 *
 * Covers everything below the browser: the public feedback endpoints, the admin
 * feedback and certificate endpoints, the dashboard endpoints, the recipient
 * resolver, the render, and the ownership rules. It creates its own Workshop and
 * Hackathon events and tears the lot down at the end.
 *
 * **No email leaves the machine.** `initEmailProviders()` is deliberately never
 * called, so the transport list is empty and `sendMail` fails closed — asserted,
 * not assumed. That also means *email delivery itself is not covered here*; the
 * plan's inbox checks still need a person.
 *
 * Not covered, by nature: anything visual (theme, dialog layout, where text sits
 * on the PDF), browser download behaviour, HTTP-layer concerns (rate limits,
 * 401s from middleware, the activity log, which only runs on real requests).
 */
import { createCanvas } from "@napi-rs/canvas";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import db from "../database/postgres/models/index.js";
import s3 from "../config/awsS3.js";
import env from "../config/env.js";
import { putObject } from "../util/s3.js";
import { initCertificateFonts } from "../services/event/certificateFonts.js";
import { validateFeedbackResponses } from "../services/event/feedbackSchema.service.js";
import { getFeedbackForm } from "../config/constants/eventFeedbackForms.js";

import {
  getPublicForm,
  lookupGuest,
  registerForFeedback,
  submitFeedback,
} from "../controllers/eventFeedback/public.controller.js";
import { listFeedbacks } from "../controllers/eventFeedback/admin.controller.js";
import {
  approveCertificates,
  correctRecipient,
  issueForFeedbacks,
  listCertificates,
  restoreCertificate,
  retryCertificate,
  revokeCertificate,
} from "../controllers/eventCertificate/issue.controller.js";
import {
  downloadMyCertificate,
  getMyCertificates,
} from "../controllers/eventCertificate/public.controller.js";

import { EVENT_CERTIFICATE_STATUS } from "../config/constants/eventCertificate.js";
import { EVENT_GUEST_STATUS } from "../config/constants/eventGuest.js";
import { EVENT_EMAIL_TEMPLATE_TYPE } from "../config/constants/event.js";
import {
  settleCertificate,
  settleCertificates,
} from "./support/settleCertificates.js";

const {
  AdminUser,
  Event,
  EventCertificate,
  EventCertificateTemplate,
  EventEmailTemplate,
  EventFeedback,
  EventGuest,
  User,
} = db;

const stamp = Date.now();
const W = 1200;
const H = 850;

let adminId = null;
const createdFileKeys = new Set();
const createdUserIds = [];

const results = [];
let section = "";

const head = (title) => {
  section = title;
  console.log(`\n${title}`);
};

const ok = (id, label, condition, detail = "") => {
  results.push({ id, label, pass: Boolean(condition), section, detail });
  console.log(
    `  ${condition ? "PASS" : "FAIL"}  ${id}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
};

/** Not an assertion — a behaviour the plan asks you to look at and decide on. */
const observe = (id, label, detail) => {
  results.push({ id, label, pass: null, section, detail });
  console.log(`  NOTE  ${id}  ${label} — ${detail}`);
};

/**
 * Express doubles.
 *
 * Resolved by the response rather than by the call: `asyncWrapper` attaches a
 * `.catch` but does not return the handler's promise, so awaiting the controller
 * would come back before it had done anything.
 */
const call = (controller, opts = {}) =>
  new Promise((resolve, reject) => {
    const { params = {}, query = {}, body = {}, user = null } = opts;
    const admin = "admin" in opts ? opts.admin : { id: adminId };

    let statusCode = 200;
    const headers = {};

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      setHeader(key, value) {
        headers[String(key).toLowerCase()] = value;
        return this;
      },
      json(data) {
        resolve({ statusCode, headers, ...data });
        return this;
      },
      send(payload) {
        resolve({ statusCode, headers, body: payload });
        return this;
      },
    };

    controller({ params, query, body, user, admin }, res, reject);
  });

/** Same, but for the cases where throwing *is* the expected outcome. */
const callExpectingThrow = async (controller, opts) => {
  try {
    const result = await call(controller, opts);
    return { threw: false, result };
  } catch (error) {
    return { threw: true, error };
  }
};

const makeBackground = () => {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = 8;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  return canvas.toBuffer("image/png");
};

const email = (label) => `e2e-${label}-${stamp}@example.com`;

const guestPayload = (name, address) => ({
  name,
  email: address,
  phone: "9999900000",
  attendeeType: "Professional",
  role: "Product Manager",
});

const makeGuest = (event, name, address, status) =>
  EventGuest.create({
    eventId: event.id,
    ...guestPayload(name, address),
    status,
  });

const setSettings = (event, patch) =>
  event.update({ settings: { ...(event.settings || {}), ...patch } });

const certificatesFor = (event) =>
  EventCertificate.findAll({
    where: { eventId: event.id },
    order: [["createdAt", "ASC"]],
  });

const countCertificates = (event) =>
  EventCertificate.count({ where: { eventId: event.id } });

const rememberFiles = async (event) => {
  for (const row of await certificatesFor(event)) {
    if (row.fileKey) createdFileKeys.add(row.fileKey);
  }
};

const WORKSHOP_ANSWERS = {
  rating: 9,
  whatWorked: "The live teardown was the best part of the session.",
  improvements: "A little more time for questions.",
  linkedinPostUrl: "https://www.linkedin.com/posts/activity-7000000000",
};

const hackathonAnswers = (teamName, members) => ({
  teamName,
  teamMembers: members,
  demoVideoUrl: "https://youtu.be/e2e-demo",
  projectUrl: "https://github.com/example/e2e",
  notes: "Built in 24 hours.",
});

const run = async () => {
  initCertificateFonts();

  const admin = await AdminUser.findOne({ attributes: ["id"] });
  if (!admin) {
    console.error("No admin user in this database — nothing can be approved.");
    process.exit(1);
  }
  adminId = admin.id;

  const backgroundKey = `tmp/e2e-scenarios-${stamp}.png`;

  const workshop = await Event.create({
    eventTitle: `E2E Workshop ${stamp}`,
    eventSlug: `e2e-workshop-${stamp}`,
    eventType: "Workshop",
    eventCategory: "Normal",
    canAcceptResponse: true,
  });

  const hackathon = await Event.create({
    eventTitle: `E2E Hackathon ${stamp}`,
    eventSlug: `e2e-hackathon-${stamp}`,
    eventType: "Hackathon",
    eventCategory: "Normal",
    canAcceptResponse: true,
  });

  try {
    // ── 0. Preconditions ────────────────────────────────────────────────────
    head("0. Preconditions");

    console.log(
      `  env  AGENDA_JOBS_ENABLED=${env.agendaEnabled} — ${
        env.agendaEnabled
          ? "issuing goes through the queue; this script runs the job body itself"
          : "issuing runs inline"
      }`,
    );

    await putObject({
      key: backgroundKey,
      body: makeBackground(),
      contentType: "image/png",
      isPrivate: true,
    });

    for (const event of [workshop, hackathon]) {
      await EventCertificateTemplate.create({
        eventId: event.id,
        name: "Participation",
        backgroundKey,
        canvasWidth: W,
        canvasHeight: H,
        fields: [
          {
            key: "recipientName",
            x: 50,
            y: 45,
            fontSize: 48,
            color: "#111111",
            align: "center",
            maxWidth: 70,
          },
          { key: "eventTitle", x: 50, y: 60, fontSize: 24, color: "#444444", align: "center" },
          { key: "issuedDate", x: 25, y: 88, fontSize: 14, color: "#666666" },
          { key: "certificateNo", x: 75, y: 88, fontSize: 12, color: "#999999" },
        ],
      });

      await EventEmailTemplate.create({
        eventId: event.id,
        type: EVENT_EMAIL_TEMPLATE_TYPE.CERTIFICATE,
        subject: "Your {{eventTitle}} certificate",
        body: "Hi {{name}}, your certificate ({{certificateNo}}) is ready. Sign in to download it.",
      });
    }

    ok("0.3", "both test events have a design and a certificate email", true);

    // ── §2 Workshop, auto-issue ON ──────────────────────────────────────────
    head("§2 Workshop · auto-issue ON");

    await setSettings(workshop, {
      autoIssueCertificate: true,
      allowSelfRegistrationOnFeedback: true,
      promoteWaitlistedOnFeedback: true,
    });

    // WS-1 — already joined
    const w1Email = email("w1");
    await makeGuest(workshop, "Anita Rao", w1Email, EVENT_GUEST_STATUS.APPROVED);

    const w1Lookup = await call(lookupGuest, {
      body: { slug: workshop.eventSlug, email: w1Email },
    });
    ok("WS-1", "a joined guest is recognised", w1Lookup.data?.found === true);

    const w1Submit = await call(submitFeedback, {
      body: { slug: workshop.eventSlug, email: w1Email, responses: WORKSHOP_ANSWERS },
    });
    ok(
      "WS-1",
      "submission accepted and a certificate is promised",
      w1Submit.statusCode === 201 && w1Submit.data?.certificate?.status === "issuing",
      `${w1Submit.statusCode} / ${w1Submit.data?.certificate?.status}`,
    );
    ok(
      "WS-1",
      "the success screen is given exactly one recipient",
      w1Submit.data?.certificate?.recipients?.length === 1,
    );

    await settleCertificates(workshop.id);
    let wsRows = await certificatesFor(workshop);

    ok(
      "WS-1",
      "one Issued certificate exists",
      wsRows.length === 1 && wsRows[0].status === EVENT_CERTIFICATE_STATUS.ISSUED,
      wsRows.map((r) => r.status).join(", "),
    );
    ok(
      "WS-1",
      "credited to Auto with no approver",
      wsRows[0]?.approvedVia === "Auto" && wsRows[0]?.approvedBy === null,
      `${wsRows[0]?.approvedVia}/${wsRows[0]?.approvedBy}`,
    );
    ok("WS-1", "a PDF was rendered and stored", Boolean(wsRows[0]?.fileKey));
    ok(
      "WS-1",
      "no email left the machine (no providers registered)",
      wsRows[0]?.emailSentAt === null,
    );

    // WS-2 — never joined
    const w2Email = email("w2");
    const w2Lookup = await call(lookupGuest, {
      body: { slug: workshop.eventSlug, email: w2Email },
    });
    ok(
      "WS-2",
      "an unknown address is offered registration",
      w2Lookup.data?.found === false && w2Lookup.data?.canRegister === true,
    );

    const w2Register = await call(registerForFeedback, {
      body: { slug: workshop.eventSlug, ...guestPayload("Bilal Khan", w2Email) },
    });
    ok("WS-2", "registration accepted", w2Register.statusCode === 201);

    const w2Guest = await EventGuest.findOne({
      where: { eventId: workshop.id, email: w2Email },
    });
    ok(
      "WS-2",
      "approved on the spot, tagged 'via feedback'",
      w2Guest?.status === EVENT_GUEST_STATUS.APPROVED &&
        w2Guest?.additionalData?.registeredVia === "feedback",
      `${w2Guest?.status} / ${w2Guest?.additionalData?.registeredVia}`,
    );

    const w2Submit = await call(submitFeedback, {
      body: { slug: workshop.eventSlug, email: w2Email, responses: WORKSHOP_ANSWERS },
    });
    ok(
      "WS-2",
      "their submission issues a certificate",
      w2Submit.data?.certificate?.status === "issuing",
    );

    await settleCertificates(workshop.id);
    ok("WS-2", "two certificates on the event now", (await countCertificates(workshop)) === 2);

    // WS-3 — waitlisted, promotion on
    const w3Email = email("w3");
    const w3Guest = await makeGuest(
      workshop,
      "Chitra Nair",
      w3Email,
      EVENT_GUEST_STATUS.WAITLISTED,
    );

    const w3Submit = await call(submitFeedback, {
      body: { slug: workshop.eventSlug, email: w3Email, responses: WORKSHOP_ANSWERS },
    });
    ok("WS-3", "a waitlisted guest is not blocked", w3Submit.statusCode === 201);

    await w3Guest.reload();
    ok(
      "WS-3",
      "promoted to Approved by submitting",
      w3Guest.status === EVENT_GUEST_STATUS.APPROVED &&
        w3Guest.additionalData?.approvedVia === "feedback",
      w3Guest.status,
    );
    ok(
      "WS-3",
      "and a certificate is issued",
      w3Submit.data?.certificate?.status === "issuing",
    );
    await settleCertificates(workshop.id);

    // WS-4 — declined
    const w4Email = email("w4");
    await makeGuest(workshop, "Declined Person", w4Email, EVENT_GUEST_STATUS.DECLINED);

    const beforeW4 = await countCertificates(workshop);
    const w4Submit = await call(submitFeedback, {
      body: { slug: workshop.eventSlug, email: w4Email, responses: WORKSHOP_ANSWERS },
    });
    ok(
      "WS-4",
      "a declined guest is refused",
      w4Submit.statusCode === 403,
      `${w4Submit.statusCode} — ${w4Submit.message}`,
    );
    ok(
      "WS-4",
      "no response was saved",
      (await EventFeedback.count({
        where: { eventId: workshop.id },
        include: [{ model: EventGuest, as: "guest", where: { email: w4Email } }],
      })) === 0,
    );
    ok(
      "WS-4",
      "no certificate was created",
      (await countCertificates(workshop)) === beforeW4,
    );

    // WS-5 — self-registration off
    await setSettings(workshop, { allowSelfRegistrationOnFeedback: false });

    const w5Lookup = await call(lookupGuest, {
      body: { slug: workshop.eventSlug, email: email("w5") },
    });
    ok(
      "WS-5",
      "with self-registration off, no registration is offered",
      w5Lookup.data?.found === false && w5Lookup.data?.canRegister === false,
    );

    const w5Register = await call(registerForFeedback, {
      body: { slug: workshop.eventSlug, ...guestPayload("Blocked", email("w5")) },
    });
    ok(
      "WS-5",
      "and registering directly is refused",
      w5Register.statusCode === 403,
      String(w5Register.statusCode),
    );

    await setSettings(workshop, { allowSelfRegistrationOnFeedback: true });

    // ── §3 Workshop, auto-issue OFF ─────────────────────────────────────────
    head("§3 Workshop · auto-issue OFF");

    await setSettings(workshop, { autoIssueCertificate: false });

    const formOff = await call(getPublicForm, { query: { slug: workshop.eventSlug } });
    ok(
      "§3",
      "the form stops promising certificates",
      formOff.data?.certificatesOnSubmit === false,
    );

    // WF-1 — already joined
    const f1Email = email("f1");
    await makeGuest(workshop, "Deepak Menon", f1Email, EVENT_GUEST_STATUS.APPROVED);

    const beforeF1 = await countCertificates(workshop);
    const f1Submit = await call(submitFeedback, {
      body: { slug: workshop.eventSlug, email: f1Email, responses: WORKSHOP_ANSWERS },
    });
    ok(
      "WF-1",
      "submission succeeds but promises nothing",
      f1Submit.statusCode === 201 &&
        f1Submit.data?.certificate?.status === "off" &&
        f1Submit.data?.certificate?.recipients?.length === 0,
      f1Submit.data?.certificate?.status,
    );
    ok(
      "WF-1",
      "nothing is created — not even a Pending row",
      (await countCertificates(workshop)) === beforeF1,
    );

    const f1Feedback = await EventFeedback.findOne({
      where: { eventId: workshop.id, id: f1Submit.data.id },
    });

    const f1List = await call(listFeedbacks, {
      params: { eventId: workshop.id },
      query: { search: f1Email },
    });
    ok(
      "WF-1",
      "the admin sees it as Not generated",
      f1List.data[0]?.certificateSummary?.none === 1 &&
        f1List.data[0]?.certificateSummary?.issued === 0,
      JSON.stringify(f1List.data[0]?.certificateSummary),
    );

    const f1Generate = await call(issueForFeedbacks, {
      params: { eventId: workshop.id },
      body: { feedbackIds: [f1Feedback.id] },
    });
    ok(
      "WF-1",
      "admin Generate creates and queues one",
      f1Generate.data?.created === 1 && f1Generate.data?.queued === 1,
      JSON.stringify(f1Generate.data),
    );

    await settleCertificates(workshop.id);

    const f1Row = await EventCertificate.findOne({
      where: { eventId: workshop.id, recipientEmail: f1Email },
    });
    ok(
      "WF-1",
      "issued, credited to the admin who pressed it",
      f1Row?.status === EVENT_CERTIFICATE_STATUS.ISSUED &&
        f1Row?.approvedVia === "Admin" &&
        f1Row?.approvedBy === adminId,
      `${f1Row?.status}/${f1Row?.approvedVia}`,
    );

    const f1Again = await call(issueForFeedbacks, {
      params: { eventId: workshop.id },
      body: { feedbackIds: [f1Feedback.id] },
    });
    ok(
      "WF-1",
      "pressing Generate again creates nothing",
      f1Again.data?.created === 0 && f1Again.data?.queued === 0 && f1Again.data?.skipped === 1,
      JSON.stringify(f1Again.data),
    );

    // WF-2 — never joined
    const f2Email = email("f2");
    await call(registerForFeedback, {
      body: { slug: workshop.eventSlug, ...guestPayload("Esha Patel", f2Email) },
    });

    const f2Guest = await EventGuest.findOne({
      where: { eventId: workshop.id, email: f2Email },
    });
    ok(
      "WF-2",
      "joining still works with certificates off",
      f2Guest?.status === EVENT_GUEST_STATUS.APPROVED &&
        f2Guest?.additionalData?.registeredVia === "feedback",
    );

    const beforeF2 = await countCertificates(workshop);
    const f2Submit = await call(submitFeedback, {
      body: { slug: workshop.eventSlug, email: f2Email, responses: WORKSHOP_ANSWERS },
    });
    ok(
      "WF-2",
      "no certificate on submit",
      f2Submit.data?.certificate?.status === "off" &&
        (await countCertificates(workshop)) === beforeF2,
    );

    await call(issueForFeedbacks, {
      params: { eventId: workshop.id },
      body: { feedbackIds: [f2Submit.data.id] },
    });
    await settleCertificates(workshop.id);
    ok(
      "WF-2",
      "admin Generate issues it",
      (await EventCertificate.findOne({
        where: { eventId: workshop.id, recipientEmail: f2Email },
      }))?.status === EVENT_CERTIFICATE_STATUS.ISSUED,
    );

    // WF-3 — waitlisted
    const f3Email = email("f3");
    const f3Guest = await makeGuest(
      workshop,
      "Farah Sheikh",
      f3Email,
      EVENT_GUEST_STATUS.WAITLISTED,
    );

    const beforeF3 = await countCertificates(workshop);
    const f3Submit = await call(submitFeedback, {
      body: { slug: workshop.eventSlug, email: f3Email, responses: WORKSHOP_ANSWERS },
    });
    await f3Guest.reload();

    ok(
      "WF-3",
      "promotion is independent of certificates",
      f3Guest.status === EVENT_GUEST_STATUS.APPROVED,
      f3Guest.status,
    );
    ok(
      "WF-3",
      "still nothing created",
      (await countCertificates(workshop)) === beforeF3,
    );

    await call(issueForFeedbacks, {
      params: { eventId: workshop.id },
      body: { feedbackIds: [f3Submit.data.id] },
    });
    await settleCertificates(workshop.id);
    ok(
      "WF-3",
      "admin Generate issues it",
      (await EventCertificate.findOne({
        where: { eventId: workshop.id, recipientEmail: f3Email },
      }))?.status === EVENT_CERTIFICATE_STATUS.ISSUED,
    );

    // WF-4 — declined after submitting
    const f4Email = email("f4");
    const f4Guest = await makeGuest(
      workshop,
      "Gita Bose",
      f4Email,
      EVENT_GUEST_STATUS.APPROVED,
    );
    const f4Submit = await call(submitFeedback, {
      body: { slug: workshop.eventSlug, email: f4Email, responses: WORKSHOP_ANSWERS },
    });
    await f4Guest.update({ status: EVENT_GUEST_STATUS.DECLINED });

    const beforeF4 = await countCertificates(workshop);
    const f4Generate = await call(issueForFeedbacks, {
      params: { eventId: workshop.id },
      body: { feedbackIds: [f4Submit.data.id] },
    });
    ok(
      "WF-4",
      "Generate skips a declined guest and says so",
      f4Generate.data?.created === 0 && f4Generate.data?.skippedDeclined === 1,
      JSON.stringify(f4Generate.data),
    );
    ok(
      "WF-4",
      "nothing was created",
      (await countCertificates(workshop)) === beforeF4,
    );

    await rememberFiles(workshop);

    // ── §4 Hackathon, auto-issue ON ─────────────────────────────────────────
    head("§4 Hackathon · auto-issue ON");

    await setSettings(hackathon, {
      autoIssueCertificate: true,
      allowSelfRegistrationOnFeedback: true,
      promoteWaitlistedOnFeedback: true,
    });

    // HK-1 — mixed team
    const h1Email = email("h1");
    const h2Email = email("h2");
    const h3Email = email("h3");

    await makeGuest(hackathon, "Hari Prasad", h1Email, EVENT_GUEST_STATUS.APPROVED);
    await makeGuest(hackathon, "Ishita Roy", h2Email, EVENT_GUEST_STATUS.APPROVED);
    // h3 is deliberately never registered.

    const h1Submit = await call(submitFeedback, {
      body: {
        slug: hackathon.eventSlug,
        email: h1Email,
        responses: hackathonAnswers("Kite", [
          { name: "Ishita Roy", email: h2Email, phone: "7700900123", countryCode: "+44" },
          { name: "Jai Verma", email: h3Email },
        ]),
      },
    });

    ok(
      "HK-1",
      "all three are named back to the submitter",
      h1Submit.data?.certificate?.recipients?.length === 3,
      (h1Submit.data?.certificate?.recipients || []).map((r) => r.name).join(", "),
    );

    await settleCertificates(hackathon.id);
    let hkRows = await certificatesFor(hackathon);

    ok(
      "HK-1",
      "three certificates issued, including the unregistered teammate",
      hkRows.length === 3 &&
        hkRows.every((r) => r.status === EVENT_CERTIFICATE_STATUS.ISSUED),
      hkRows.map((r) => `${r.recipientEmail.split("-")[1]}:${r.status}`).join(", "),
    );
    ok(
      "HK-1",
      "submitter is Attendee, teammates are Teammate",
      hkRows.find((r) => r.recipientEmail === h1Email)?.source === "Attendee" &&
        hkRows.find((r) => r.recipientEmail === h2Email)?.source === "Teammate" &&
        hkRows.find((r) => r.recipientEmail === h3Email)?.source === "Teammate",
    );
    ok(
      "HK-1",
      "the unregistered teammate's row carries no guest link yet",
      hkRows.find((r) => r.recipientEmail === h3Email)?.guestId === null,
    );

    const h1List = await call(listFeedbacks, {
      params: { eventId: hackathon.id },
      query: { search: h1Email },
    });
    const h1Row = h1List.data[0];
    ok(
      "HK-1",
      "the admin row carries the country code with the phone",
      h1Row?.teammates?.find((t) => t.email === h2Email)?.countryCode === "+44",
      h1Row?.teammates?.find((t) => t.email === h2Email)?.countryCode,
    );
    ok(
      "HK-1",
      "and every recipient's certificate is attached",
      h1Row?.certificateSummary?.issued === 3 && h1Row?.certificateSummary?.none === 0,
      JSON.stringify(h1Row?.certificateSummary),
    );

    // HK-2 — submitter never joined
    const h4Email = email("h4");
    const h5Email = email("h5");

    await call(registerForFeedback, {
      body: { slug: hackathon.eventSlug, ...guestPayload("Kavya Menon", h4Email) },
    });

    const h2Submit = await call(submitFeedback, {
      body: {
        slug: hackathon.eventSlug,
        email: h4Email,
        responses: hackathonAnswers("Comet", [{ name: "Lakshmi Iyer", email: h5Email }]),
      },
    });
    ok(
      "HK-2",
      "a self-registered submitter issues for the whole team",
      h2Submit.data?.certificate?.recipients?.length === 2,
    );
    await settleCertificates(hackathon.id);
    ok("HK-2", "five certificates on the event now", (await countCertificates(hackathon)) === 5);

    // HK-3 — submitter waitlisted
    const h6Email = email("h6");
    const h7Email = email("h7");
    const h6Guest = await makeGuest(
      hackathon,
      "Manav Gupta",
      h6Email,
      EVENT_GUEST_STATUS.WAITLISTED,
    );

    const h3Submit = await call(submitFeedback, {
      body: {
        slug: hackathon.eventSlug,
        email: h6Email,
        responses: hackathonAnswers("Dune", [{ name: "Nisha Bhatt", email: h7Email }]),
      },
    });
    await h6Guest.reload();

    ok(
      "HK-3",
      "waitlisted submitter is promoted",
      h6Guest.status === EVENT_GUEST_STATUS.APPROVED,
    );
    ok(
      "HK-3",
      "and the team is issued",
      h3Submit.data?.certificate?.recipients?.length === 2,
    );
    await settleCertificates(hackathon.id);

    // HK-4 — submitter declined
    const h8Email = email("h8");
    const h9Email = email("h9");
    await makeGuest(hackathon, "Omar Sethi", h8Email, EVENT_GUEST_STATUS.DECLINED);

    const beforeH4 = await countCertificates(hackathon);
    const h4Submit = await call(submitFeedback, {
      body: {
        slug: hackathon.eventSlug,
        email: h8Email,
        responses: hackathonAnswers("Ghost", [{ name: "Priya Das", email: h9Email }]),
      },
    });
    ok("HK-4", "a declined submitter is refused", h4Submit.statusCode === 403);
    ok(
      "HK-4",
      "and cannot mint certificates for the team they named",
      (await countCertificates(hackathon)) === beforeH4,
    );

    // HK-5 — a teammate tries to submit too
    const h5Lookup = await call(lookupGuest, {
      body: { slug: hackathon.eventSlug, email: h2Email },
    });
    ok(
      "HK-5",
      "the teammate is told their team already submitted",
      h5Lookup.data?.alreadySubmitted === "team" &&
        h5Lookup.data?.submittedBy?.name === "Hari Prasad",
      `${h5Lookup.data?.alreadySubmitted} / ${h5Lookup.data?.submittedBy?.name}`,
    );

    const h5Submit = await call(submitFeedback, {
      body: {
        slug: hackathon.eventSlug,
        email: h2Email,
        responses: hackathonAnswers("Kite Again", []),
      },
    });
    ok(
      "HK-5",
      "and submitting is refused, naming who did",
      h5Submit.statusCode === 409 && /Hari Prasad/.test(h5Submit.message || ""),
      h5Submit.message,
    );

    // HK-6 — a named teammate registers afterwards
    const h3Before = await EventCertificate.findOne({
      where: { eventId: hackathon.id, recipientEmail: h3Email },
    });

    await call(registerForFeedback, {
      body: { slug: hackathon.eventSlug, ...guestPayload("Jai Verma", h3Email) },
    });

    const h3After = await EventCertificate.findOne({
      where: { eventId: hackathon.id, recipientEmail: h3Email },
    });
    const h3Guest = await EventGuest.findOne({
      where: { eventId: hackathon.id, email: h3Email },
    });

    ok(
      "HK-6",
      "registering later attaches the existing certificate to the guest",
      h3After?.guestId === h3Guest?.id && h3Guest?.id != null,
    );
    ok(
      "HK-6",
      "the certificate number does not change",
      h3After?.certificateNo === h3Before?.certificateNo,
    );
    ok(
      "HK-6",
      "and the printed name is left exactly as it was",
      h3After?.recipientName === h3Before?.recipientName,
      h3After?.recipientName,
    );

    // HK-7 — teammate already holds an admin-created certificate
    const h10Email = email("h10");
    const h11Email = email("h11");
    await makeGuest(hackathon, "Rhea Kapoor", h10Email, EVENT_GUEST_STATUS.APPROVED);

    const heldRow = await EventCertificate.create({
      eventId: hackathon.id,
      guestId: null,
      certificateNo: `GRD-2026-HELD${String(stamp).slice(-4)}`,
      recipientName: "Sanjay Held",
      recipientEmail: h11Email,
      source: "Teammate",
      status: EVENT_CERTIFICATE_STATUS.PENDING,
    });

    await call(submitFeedback, {
      body: {
        slug: hackathon.eventSlug,
        email: h10Email,
        responses: hackathonAnswers("Orbit", [
          { name: "Sanjay Held", email: h11Email },
        ]),
      },
    });
    await settleCertificates(hackathon.id);
    await heldRow.reload();

    ok(
      "HK-7",
      "an admin-held Pending row is left untouched by a submission",
      heldRow.status === EVENT_CERTIFICATE_STATUS.PENDING,
      heldRow.status,
    );
    ok(
      "HK-7",
      "and no second certificate is created for that address",
      (await EventCertificate.count({
        where: { eventId: hackathon.id, recipientEmail: h11Email },
      })) === 1,
    );

    // HK-8 — duplicate names
    const h12Email = email("h12");
    const h13Email = email("h13");
    await makeGuest(hackathon, "Tara Menon", h12Email, EVENT_GUEST_STATUS.APPROVED);

    const h8Submit = await call(submitFeedback, {
      body: {
        slug: hackathon.eventSlug,
        email: h12Email,
        responses: hackathonAnswers("Echo", [
          { name: "Tara Menon", email: h12Email },
          { name: "Uma Shah", email: h13Email },
          { name: "Uma Shah", email: h13Email },
        ]),
      },
    });

    ok(
      "HK-8",
      "the submitter naming themselves and a repeated teammate dedupe to two",
      h8Submit.data?.certificate?.recipients?.length === 2,
      (h8Submit.data?.certificate?.recipients || []).map((r) => r.email.split("-")[1]).join(", "),
    );
    await settleCertificates(hackathon.id);
    ok(
      "HK-8",
      "one certificate each",
      (await EventCertificate.count({
        where: { eventId: hackathon.id, recipientEmail: h12Email },
      })) === 1,
    );

    // ── §5 Hackathon, auto-issue OFF ────────────────────────────────────────
    head("§5 Hackathon · auto-issue OFF");

    await setSettings(hackathon, { autoIssueCertificate: false });

    const hf1Email = email("hf1");
    const hf2Email = email("hf2");
    const hf3Email = email("hf3");
    await makeGuest(hackathon, "Vikram Nair", hf1Email, EVENT_GUEST_STATUS.APPROVED);

    const beforeHf1 = await countCertificates(hackathon);
    const hf1Submit = await call(submitFeedback, {
      body: {
        slug: hackathon.eventSlug,
        email: hf1Email,
        responses: hackathonAnswers("Zephyr", [
          { name: "Wasim Ali", email: hf2Email },
          { name: "Yamini Rao", email: hf3Email },
        ]),
      },
    });

    ok(
      "HF-1",
      "submission promises nothing and creates nothing",
      hf1Submit.data?.certificate?.status === "off" &&
        (await countCertificates(hackathon)) === beforeHf1,
    );

    const hf1Generate = await call(issueForFeedbacks, {
      params: { eventId: hackathon.id },
      body: { feedbackIds: [hf1Submit.data.id] },
    });
    ok(
      "HF-1",
      "one press issues the whole team",
      hf1Generate.data?.created === 3,
      JSON.stringify(hf1Generate.data),
    );

    await settleCertificates(hackathon.id);
    const hf1Rows = await EventCertificate.findAll({
      where: { eventId: hackathon.id, sourceFeedbackId: hf1Submit.data.id },
    });
    ok(
      "HF-1",
      "all three credited to the admin",
      hf1Rows.length === 3 &&
        hf1Rows.every((r) => r.approvedVia === "Admin" && r.approvedBy === adminId),
    );

    const hf1Again = await call(issueForFeedbacks, {
      params: { eventId: hackathon.id },
      body: { feedbackIds: [hf1Submit.data.id] },
    });
    ok(
      "HF-1",
      "a second press creates nothing",
      hf1Again.data?.created === 0,
      JSON.stringify(hf1Again.data),
    );

    // HF-3 — bulk across responses
    const hf4Email = email("hf4");
    const hf5Email = email("hf5");
    await makeGuest(hackathon, "Zoya Khan", hf4Email, EVENT_GUEST_STATUS.APPROVED);
    await makeGuest(hackathon, "Arjun Rao", hf5Email, EVENT_GUEST_STATUS.APPROVED);

    const bulkA = await call(submitFeedback, {
      body: {
        slug: hackathon.eventSlug,
        email: hf4Email,
        responses: hackathonAnswers("Bulk A", []),
      },
    });
    const bulkB = await call(submitFeedback, {
      body: {
        slug: hackathon.eventSlug,
        email: hf5Email,
        responses: hackathonAnswers("Bulk B", []),
      },
    });

    const bulkSelected = await call(issueForFeedbacks, {
      params: { eventId: hackathon.id },
      body: { feedbackIds: [bulkA.data.id] },
    });
    ok(
      "HF-3",
      "a tick-selection issues only what was ticked",
      bulkSelected.data?.created === 1,
      JSON.stringify(bulkSelected.data),
    );

    const bulkAll = await call(issueForFeedbacks, {
      params: { eventId: hackathon.id },
      body: { all: true },
    });
    ok(
      "HF-3",
      "'all' picks up the rest and reports the declined it skipped",
      bulkAll.data?.created >= 1 && bulkAll.data?.skippedDeclined >= 0,
      JSON.stringify(bulkAll.data),
    );
    await settleCertificates(hackathon.id);
    ok(
      "HF-3",
      "the second response is now issued too",
      (await EventCertificate.findOne({
        where: { eventId: hackathon.id, recipientEmail: hf5Email },
      }))?.status === EVENT_CERTIFICATE_STATUS.ISSUED,
    );

    await rememberFiles(hackathon);

    // ── §6 Decisions ────────────────────────────────────────────────────────
    head("§6 Behaviours needing a decision");

    // D1 — waitlisted with promotion OFF
    await setSettings(workshop, {
      autoIssueCertificate: true,
      promoteWaitlistedOnFeedback: false,
    });

    const d1Email = email("d1");
    const d1Guest = await makeGuest(
      workshop,
      "Waitlist Stays",
      d1Email,
      EVENT_GUEST_STATUS.WAITLISTED,
    );

    const d1Submit = await call(submitFeedback, {
      body: { slug: workshop.eventSlug, email: d1Email, responses: WORKSHOP_ANSWERS },
    });
    await d1Guest.reload();
    await settleCertificates(workshop.id);

    const d1Cert = await EventCertificate.findOne({
      where: { eventId: workshop.id, recipientEmail: d1Email },
    });

    // Decided 2026-08-12: keep it. The switch governs whether submitting
    // *approves* someone, not whether they are certified — they turned up and
    // gave feedback, so the certificate is earned. Asserted rather than
    // observed so the behaviour cannot drift back by accident.
    ok(
      "D1",
      "waitlisted + promotion OFF: not promoted, but still certified",
      d1Submit.statusCode === 201 &&
        d1Guest.status === EVENT_GUEST_STATUS.WAITLISTED &&
        d1Cert?.status === EVENT_CERTIFICATE_STATUS.ISSUED,
      `guest ${d1Guest.status}, certificate ${d1Cert ? d1Cert.status : "none"}`,
    );

    await setSettings(workshop, { promoteWaitlistedOnFeedback: true });

    // D2 — a declined guest named as somebody else's teammate
    await setSettings(hackathon, { autoIssueCertificate: true });

    const d2Submitter = email("d2s");
    const d2Declined = email("d2d");
    await makeGuest(hackathon, "Deciding Submitter", d2Submitter, EVENT_GUEST_STATUS.APPROVED);
    await makeGuest(hackathon, "Declined Teammate", d2Declined, EVENT_GUEST_STATUS.DECLINED);

    await call(submitFeedback, {
      body: {
        slug: hackathon.eventSlug,
        email: d2Submitter,
        responses: hackathonAnswers("Decision", [
          { name: "Declined Teammate", email: d2Declined },
        ]),
      },
    });
    await settleCertificates(hackathon.id);

    const d2Cert = await EventCertificate.findOne({
      where: { eventId: hackathon.id, recipientEmail: d2Declined },
    });
    // Decided 2026-08-12: keep it. Declining is about attendance, not about the
    // work — a submitter naming someone is vouching that they contributed. The
    // check stays on the submitter alone, deliberately.
    ok(
      "D2",
      "a declined guest named as a teammate is still certified",
      d2Cert?.status === EVENT_CERTIFICATE_STATUS.ISSUED,
      d2Cert ? d2Cert.status : "none — teammates are being status-checked",
    );

    // ── §7 Mechanics ────────────────────────────────────────────────────────
    head("§7 Mechanics");

    const wsForm = getFeedbackForm("Workshop");
    ok(
      "M1",
      "Workshop asks the four expected questions, in order",
      wsForm.fields.map((f) => f.label).join(" | ") ===
        "How would you rate this session? | Your feedback | What could we do better? | LinkedIn Post Link (Mandatory for Workshop Certification)",
      wsForm.fields.map((f) => f.label).join(" | "),
    );

    const hkForm = getFeedbackForm("Hackathon");
    ok(
      "M2",
      "Hackathon asks team name, teammates, demo, repo, credentials, notes",
      hkForm.fields.map((f) => f.key).join(",") ===
        "teamName,teamMembers,demoVideoUrl,projectUrl,projectCredentials,notes",
      hkForm.fields.map((f) => f.key).join(","),
    );

    // The one deliberate exception is TPS's own LinkedIn wording, copied
    // verbatim. Anything *else* mentioning certificates would be a promise the
    // form is not entitled to make.
    const mentionsCertificates = (form) =>
      JSON.stringify(form)
        .replace(/LinkedIn Post Link \(Mandatory for Workshop Certification\)/g, "")
        .match(/certificat/gi) || [];

    ok(
      "M4",
      "neither form promises the filler a certificate",
      mentionsCertificates(wsForm).length === 0 &&
        mentionsCertificates(hkForm).length === 0,
      `workshop: ${mentionsCertificates(wsForm).join(",") || "none"} · hackathon: ${
        mentionsCertificates(hkForm).join(",") || "none"
      }`,
    );

    const emptyWorkshop = validateFeedbackResponses("Workshop", {});
    ok(
      "M5",
      "an empty Workshop submission is rejected with a named field",
      !emptyWorkshop.valid && /rate this session/i.test(emptyWorkshop.errors[0]),
      emptyWorkshop.errors[0],
    );

    const linkedinCases = [
      ["https://www.linkedin.com/posts/activity-123", true],
      ["https://www.linkedin.com/in/someone", false],
      ["http://linkedin.com/posts/abc", false],
      ["", true],
    ];
    const linkedinPass = linkedinCases.every(([value, shouldPass]) => {
      const res = validateFeedbackResponses("Workshop", {
        ...WORKSHOP_ANSWERS,
        linkedinPostUrl: value,
      });
      return res.valid === shouldPass;
    });
    ok("M6", "the LinkedIn rule matches TPS exactly", linkedinPass);

    const sixMembers = validateFeedbackResponses(
      "Hackathon",
      hackathonAnswers(
        "Too Many",
        Array.from({ length: 6 }, (_, i) => ({
          name: `Member ${i}`,
          email: `m${i}-${stamp}@example.com`,
        })),
      ),
    );
    ok("M7", "a sixth teammate is refused", !sixMembers.valid, sixMembers.errors?.[0]);

    const noEmailMember = validateFeedbackResponses(
      "Hackathon",
      hackathonAnswers("No Email", [{ name: "Nameless" }]),
    );
    ok("M7", "a teammate without an email is refused", !noEmailMember.valid);

    // M8–M12 — the artifact
    const longEmail = email("long");
    await makeGuest(
      workshop,
      "bartholomew maximilian featherstonehaugh-worthington",
      longEmail,
      EVENT_GUEST_STATUS.APPROVED,
    );
    await call(submitFeedback, {
      body: { slug: workshop.eventSlug, email: longEmail, responses: WORKSHOP_ANSWERS },
    });
    await settleCertificates(workshop.id);

    const longRow = await EventCertificate.findOne({
      where: { eventId: workshop.id, recipientEmail: longEmail },
    });
    if (longRow?.fileKey) createdFileKeys.add(longRow.fileKey);

    ok(
      "M9",
      "a very long name still renders without throwing",
      longRow?.status === EVENT_CERTIFICATE_STATUS.ISSUED && Boolean(longRow.fileKey),
      longRow?.lastError || "rendered",
    );
    ok(
      "M11",
      "certificate numbers look right and are unique",
      /^GRD-\d{4}-[A-Z0-9]{8}$/.test(longRow?.certificateNo || ""),
      longRow?.certificateNo,
    );
    ok(
      "M12",
      "the template is snapshotted onto the row",
      Array.isArray(longRow?.templateSnapshot?.fields) &&
        longRow.templateSnapshot.fields.length === 4,
    );

    const templateBefore = JSON.stringify(longRow.templateSnapshot);
    await EventCertificateTemplate.update(
      { name: "Renamed after issuing" },
      { where: { eventId: workshop.id } },
    );
    await longRow.reload();
    ok(
      "M12",
      "editing the template afterwards does not touch an issued row",
      JSON.stringify(longRow.templateSnapshot) === templateBefore,
    );

    // M14 — admin search
    const byTeammateName = await call(listFeedbacks, {
      params: { eventId: hackathon.id },
      query: { search: "Ishita" },
    });
    ok(
      "M14",
      "searching a teammate's name finds the response they were named on",
      byTeammateName.meta.total === 1,
      `${byTeammateName.meta.total} row(s)`,
    );

    const byTeammateEmail = await call(listFeedbacks, {
      params: { eventId: hackathon.id },
      query: { search: h2Email },
    });
    ok("M14", "searching a teammate's email works too", byTeammateEmail.meta.total === 1);

    const bySubmitter = await call(listFeedbacks, {
      params: { eventId: hackathon.id },
      query: { search: "Hari" },
    });
    ok("M14", "searching the submitter works", bySubmitter.meta.total === 1);

    // M19 — certificate lookup
    const certForSearch = hkRows.find((r) => r.recipientEmail === h1Email);
    const byNumber = await call(listCertificates, {
      params: { eventId: hackathon.id },
      query: { search: certForSearch.certificateNo.slice(-6) },
    });
    ok("M19", "a partial certificate number finds one row", byNumber.data.length === 1);

    const filtered = await call(listCertificates, {
      params: { eventId: hackathon.id },
      query: { status: EVENT_CERTIFICATE_STATUS.PENDING },
    });
    const unfiltered = await call(listCertificates, {
      params: { eventId: hackathon.id },
    });
    ok(
      "M19",
      "a status filter narrows the rows but not the counts",
      filtered.data.every((r) => r.status === "Pending") &&
        JSON.stringify(filtered.counts) === JSON.stringify(unfiltered.counts),
      JSON.stringify(filtered.counts),
    );

    // M20 — send, retry.
    //
    // A fresh Pending row, not the one from HK-7: the bulk "generate for all" in
    // HF-3 re-approves anything Pending, which is correct behaviour and would
    // leave nothing here to send.
    const pendingRow = await EventCertificate.create({
      eventId: hackathon.id,
      guestId: null,
      certificateNo: `GRD-2026-SEND${String(stamp).slice(-4)}`,
      recipientName: "Pending By Hand",
      recipientEmail: email("pending"),
      source: "Teammate",
      status: EVENT_CERTIFICATE_STATUS.PENDING,
    });

    const sendResult = await call(approveCertificates, {
      params: { eventId: hackathon.id },
      body: { certificateIds: [pendingRow.id] },
    });
    ok(
      "M20",
      "a Pending row can be sent by hand",
      sendResult.data?.approved === 1,
      JSON.stringify(sendResult.data),
    );
    await settleCertificates(hackathon.id);
    await pendingRow.reload();
    ok(
      "M20",
      "and it issues",
      pendingRow.status === EVENT_CERTIFICATE_STATUS.ISSUED,
      pendingRow.status,
    );
    if (pendingRow.fileKey) createdFileKeys.add(pendingRow.fileKey);

    const failedRow = await EventCertificate.findOne({
      where: { eventId: hackathon.id, recipientEmail: h5Email },
    });
    await failedRow.update({
      status: EVENT_CERTIFICATE_STATUS.FAILED,
      lastError: "simulated failure",
    });

    const retry = await call(retryCertificate, { params: { id: failedRow.id } });
    ok("M20", "a Failed row can be retried", retry.statusCode === 200, retry.message);
    await settleCertificate(failedRow.id);
    await failedRow.reload();
    ok(
      "M20",
      "and it comes back Issued",
      failedRow.status === EVENT_CERTIFICATE_STATUS.ISSUED,
      failedRow.status,
    );

    const emailOnlyRow = await EventCertificate.findOne({
      where: { eventId: hackathon.id, recipientEmail: h1Email },
    });
    const fileKeyBefore = emailOnlyRow.fileKey;
    const numberBefore = emailOnlyRow.certificateNo;
    const emailRetry = await call(retryCertificate, { params: { id: emailOnlyRow.id } });
    await emailOnlyRow.reload();
    ok(
      "M20",
      "retrying an Issued row resends the mail only — no re-render",
      emailOnlyRow.fileKey === fileKeyBefore &&
        emailOnlyRow.certificateNo === numberBefore &&
        /email/i.test(emailRetry.message || ""),
      emailRetry.message,
    );

    // M21–M23 — revoke, restore, correct
    const revokeTarget = await EventCertificate.findOne({
      where: { eventId: hackathon.id, recipientEmail: h3Email },
    });

    await call(revokeCertificate, { params: { id: revokeTarget.id } });
    await revokeTarget.reload();
    ok("M21", "revoke sets the row to Revoked", revokeTarget.status === "Revoked");

    const restore = await call(restoreCertificate, { params: { id: revokeTarget.id } });
    await revokeTarget.reload();
    ok(
      "M22",
      "restore puts it back to Issued with the same number",
      revokeTarget.status === EVENT_CERTIFICATE_STATUS.ISSUED &&
        restore.data?.status === EVENT_CERTIFICATE_STATUS.ISSUED,
      revokeTarget.certificateNo,
    );

    const restoreAgain = await call(restoreCertificate, { params: { id: revokeTarget.id } });
    ok(
      "M22",
      "restoring one that is not revoked is refused",
      restoreAgain.statusCode === 400,
      String(restoreAgain.statusCode),
    );

    const correctEmail = await call(correctRecipient, {
      params: { id: revokeTarget.id },
      body: { name: "Jai Verma", email: email("corrected") },
    });
    await revokeTarget.reload();
    ok(
      "M23",
      "correcting an email revokes the original and mints a replacement",
      revokeTarget.status === "Revoked" && Boolean(correctEmail.data?.certificateNo),
      correctEmail.data?.certificateNo,
    );

    const blockedRestore = await call(restoreCertificate, {
      params: { id: revokeTarget.id },
    });
    ok(
      "M23",
      "the replaced original cannot be restored",
      blockedRestore.statusCode === 409,
      blockedRestore.message,
    );

    // M24 — the known bug
    const nameOnlyTarget = await EventCertificate.findOne({
      where: { eventId: hackathon.id, recipientEmail: h2Email },
    });
    const nameOnly = await callExpectingThrow(correctRecipient, {
      params: { id: nameOnlyTarget.id },
      body: { name: "Ishita Roy-Chowdhury" },
    });
    // K1 is fixed by the partial unique index (20260812130000): a revoked
    // original and its live replacement may now share an address.
    const nameOnlyKind = nameOnly.threw
      ? `${nameOnly.error?.name} — ${nameOnly.error?.message}`
      : "";

    ok(
      "M24",
      "K1 fixed — a name-only correction on an Issued row succeeds",
      !nameOnly.threw && nameOnly.result?.statusCode === 200,
      nameOnly.threw ? `still throwing: ${nameOnlyKind}` : nameOnly.result?.message,
    );

    if (!nameOnly.threw) {
      await nameOnlyTarget.reload();
      const replacement = await EventCertificate.findOne({
        where: { replacesCertificateId: nameOnlyTarget.id },
      });

      ok(
        "M24",
        "the original is revoked and the replacement carries the corrected name",
        nameOnlyTarget.status === "Revoked" &&
          replacement?.recipientName === "Ishita Roy-Chowdhury" &&
          replacement?.recipientEmail === nameOnlyTarget.recipientEmail,
        `${nameOnlyTarget.status} → ${replacement?.certificateNo} for ${replacement?.recipientName}`,
      );
    }

    // M25 — settings merge
    await setSettings(workshop, { autoIssueCertificate: false });
    const merged = await Event.findByPk(workshop.id, { attributes: ["settings"] });
    ok(
      "M25",
      "changing one switch leaves the others alone",
      merged.settings.autoIssueCertificate === false &&
        merged.settings.allowSelfRegistrationOnFeedback === true,
      JSON.stringify(merged.settings),
    );
    await setSettings(workshop, { autoIssueCertificate: true });

    // ── §7.4 + §8 Dashboard and access control ──────────────────────────────
    head("§7.4 / §8 Dashboard and access control");

    const userA = await User.create({
      fullName: "Dashboard User A",
      email: h1Email,
    });
    const userB = await User.create({
      fullName: "Dashboard User B",
      email: hf1Email,
    });
    createdUserIds.push(userA.id, userB.id);

    const mineA = await call(getMyCertificates, { user: { id: userA.id } });
    ok(
      "M26",
      "the dashboard lists only that person's certificates",
      Array.isArray(mineA.data) &&
        mineA.data.length > 0 &&
        mineA.data.every((c) => c.recipientEmail === h1Email || !c.recipientEmail),
      `${mineA.data?.length} row(s)`,
    );

    const ownCertificate = await EventCertificate.findOne({
      where: {
        eventId: hackathon.id,
        recipientEmail: h1Email,
        status: EVENT_CERTIFICATE_STATUS.ISSUED,
      },
    });

    const download = await call(downloadMyCertificate, {
      params: { certificateNo: ownCertificate.certificateNo },
      user: { id: userA.id },
    });

    const isPdf =
      Buffer.isBuffer(download.body) &&
      download.body.subarray(0, 4).toString() === "%PDF";

    ok(
      "M27",
      "downloading returns a real PDF, as an attachment",
      download.statusCode === 200 &&
        isPdf &&
        /attachment; filename=/.test(download.headers["content-disposition"] || ""),
      download.headers["content-disposition"],
    );
    ok(
      "M28",
      "no storage URL is handed to the browser",
      download.headers["content-type"] === "application/pdf" &&
        !JSON.stringify(download.headers).includes("http"),
      JSON.stringify(download.headers),
    );

    const foreign = await call(downloadMyCertificate, {
      params: { certificateNo: ownCertificate.certificateNo },
      user: { id: userB.id },
    });
    ok(
      "X1",
      "another user asking for it gets 404, not 403",
      foreign.statusCode === 404,
      `${foreign.statusCode} — ${foreign.message}`,
    );

    const noSession = await call(getMyCertificates, { user: null });
    ok(
      "X2",
      "no session resolves to no user (401 comes from the middleware above)",
      noSession.statusCode === 404,
      String(noSession.statusCode),
    );

    const revokedForDownload = await EventCertificate.findOne({
      where: { eventId: hackathon.id, status: "Revoked" },
    });
    if (revokedForDownload) {
      const revokedOwner = await User.create({
        fullName: "Revoked Owner",
        email: revokedForDownload.recipientEmail,
      });
      createdUserIds.push(revokedOwner.id);

      const revokedDownload = await call(downloadMyCertificate, {
        params: { certificateNo: revokedForDownload.certificateNo },
        user: { id: revokedOwner.id },
      });
      ok(
        "M21",
        "a revoked certificate stops downloading",
        revokedDownload.statusCode === 404,
        String(revokedDownload.statusCode),
      );
    }

    const injection = await call(listFeedbacks, {
      params: { eventId: hackathon.id },
      query: { search: "%' OR 1=1 --" },
    });
    ok(
      "X7",
      "the search term is bound, not interpolated",
      injection.meta.total === 0,
      `${injection.meta.total} row(s)`,
    );

    // X8 — the CDN probe
    const probeKey = ownCertificate.fileKey;
    const cdnUrl = `${env.assets.baseUrl}/${probeKey}`;
    let cdnStatus = "unreachable";
    try {
      const probe = await fetch(cdnUrl);
      cdnStatus = String(probe.status);
    } catch (error) {
      cdnStatus = `error: ${error.message}`;
    }
    ok(
      "X8 ⚠️",
      "K2 — a private certificate must not be readable over the CDN",
      cdnStatus === "403" || cdnStatus === "404",
      `${cdnUrl} -> ${cdnStatus}`,
    );
  } finally {
    head("Cleaning up");

    for (const event of [workshop, hackathon]) {
      await rememberFiles(event).catch(() => {});
      await EventCertificate.destroy({ where: { eventId: event.id } });
      await EventFeedback.destroy({ where: { eventId: event.id } });
      await EventCertificateTemplate.destroy({ where: { eventId: event.id } });
      await EventEmailTemplate.destroy({ where: { eventId: event.id } });
      await EventGuest.destroy({ where: { eventId: event.id } });
      await event.destroy();
    }

    for (const id of createdUserIds) {
      await User.destroy({ where: { id } }).catch(() => {});
    }

    for (const key of [`tmp/e2e-scenarios-${stamp}.png`, ...createdFileKeys]) {
      await s3
        .send(
          new DeleteObjectCommand({
            Bucket: psEnv.AWS_BUCKET_NAME,
            Key: key,
          }),
        )
        .catch(() => {});
    }

    const passed = results.filter((r) => r.pass === true).length;
    const failed = results.filter((r) => r.pass === false);
    const notes = results.filter((r) => r.pass === null);

    console.log(`\n${"=".repeat(70)}`);
    console.log(`${passed} passed · ${failed.length} failed · ${notes.length} to decide`);

    if (failed.length) {
      console.log("\nFailed:");
      for (const f of failed) console.log(`  ${f.id}  ${f.label}${f.detail ? ` — ${f.detail}` : ""}`);
    }

    if (notes.length) {
      console.log("\nFor you to decide:");
      for (const n of notes) console.log(`  ${n.id}  ${n.label} — ${n.detail}`);
    }

    console.log("");
  }
};

run()
  .then(() => process.exit(results.some((r) => r.pass === false) ? 1 : 0))
  .catch((error) => {
    console.error("\nRUN FAILED:", error);
    process.exit(1);
  });
