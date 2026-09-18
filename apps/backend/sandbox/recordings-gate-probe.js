/**
 * Drives the recording watch flow end to end against the dev database.
 *
 * Creates a throwaway user and three throwaway recordings, walks every branch
 * the player can take, then deletes everything it made.
 *
 *   node sandbox/recordings-gate-probe.js
 */
require("dotenv").config();

const jwt = require("jsonwebtoken");
const { ulid } = require("ulid");

const db = require("../models");
const {
  getWatchState,
  createRecordingLead,
} = require("../controllers/recording/leadController");
const requireUser = require("../middlewares/requireUser");

const { Recording, RecordingLead, users } = db;

let pass = 0;
const failures = [];

const ok = (label, condition) => {
  if (condition) {
    pass += 1;
  } else {
    failures.push(label);
    console.log("  FAIL:", label);
  }
};

/**
 * `asyncWrapper` returns undefined rather than the promise, so the only way to
 * know a handler finished is to wait for the response it writes — or for the
 * error it hands to `next`.
 */
const call = (handler, req = {}) =>
  new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(body) {
        resolve({ status, body });
        return this;
      },
    };
    handler({ query: {}, body: {}, params: {}, ...req }, res, (err) =>
      reject(err instanceof Error ? err : new Error(String(err)))
    );
  });

/** Runs `requireUser` first, the way the router does. */
const authed = (handler, token, req = {}) =>
  new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(body) {
        resolve({ status, body });
        return this;
      },
    };

    const request = {
      query: {},
      body: {},
      params: {},
      headers: { authorization: `Bearer ${token}` },
      ...req,
    };

    requireUser(request, res, () => {
      handler(request, res, (err) =>
        reject(err instanceof Error ? err : new Error(String(err)))
      );
    });
  });

const makeRecording = (title) =>
  Recording.create({
    id: ulid(),
    slug: `probe-${ulid().toLowerCase()}`,
    title,
    video: {
      provider: "youtube",
      url: "https://youtube.com/watch?v=probeVID001",
      videoId: "probeVID001",
    },
    durationMinutes: 42,
    content: {},
    settings: {},
    isPublished: true,
    publishedAt: new Date(),
  });

const FORM = {
  name: "Probe Person",
  email: "probe.person@example.com",
  phone: "9876543210",
  countryCode: "+91",
  attendeeType: "Professional",
  role: "Product Manager @ Probe",
  linkedinUrl: "https://linkedin.com/in/probe",
};

const run = async () => {
  const email = `probe-${Date.now()}@example.com`;

  const user = await users.create({
    name: "Probe User",
    email,
    password: "not-a-real-password",
  });

  const token = jwt.sign(
    { user_id: user.id, email },
    process.env.JWT_SECRET || "your_secret_key",
    { expiresIn: "1h" }
  );

  const [one, two, three] = await Promise.all([
    makeRecording("Probe recording one"),
    makeRecording("Probe recording two"),
    makeRecording("Probe recording three"),
  ]);

  const cleanup = async () => {
    await RecordingLead.destroy({ where: { userId: user.id } });
    await Recording.destroy({ where: { id: [one.id, two.id, three.id] } });
    await users.destroy({ where: { id: user.id } });
  };

  try {
    /* ── the gate is closed to anonymous callers ─────────────────────────── */
    const anon = await call(requireUser, { headers: {} });
    ok("no token is a 401", anon.status === 401);

    /* ── first recording, never seen ─────────────────────────────────────── */
    let res = await authed(getWatchState, token, {
      query: { recordingId: one.id },
    });
    ok("probe: not unlocked", res.body.data.unlocked === false);
    ok("probe: no profile", res.body.data.hasProfile === false);
    ok("probe: no video leaked", !res.body.data.video);
    ok("probe: prefill carries the account name", res.body.data.prefill.name === "Probe User");
    ok("probe: prefill carries the account email", res.body.data.prefill.email === email);

    /* ── a carry with nothing to carry asks for the form ─────────────────── */
    res = await authed(createRecordingLead, token, {
      body: { recordingId: one.id },
    });
    ok("empty carry is 422", res.status === 422);
    ok("empty carry says needsProfile", res.body.needsProfile === true);
    ok("empty carry is not a confirmation", res.body.needsConfirm === false);
    ok("empty carry wrote nothing", (await RecordingLead.count({ where: { userId: user.id } })) === 0);

    /* ── filling the form ────────────────────────────────────────────────── */
    res = await authed(createRecordingLead, token, {
      body: { recordingId: one.id, ...FORM },
    });
    ok("form submit is 201", res.status === 201);
    ok("form submit returns the video", res.body.data.video.videoId === "probeVID001");

    let lead = await RecordingLead.findOne({ where: { recordingId: one.id } });
    ok("lead: name stored", lead.name === FORM.name);
    ok("lead: email lowercased", lead.email === FORM.email.toLowerCase());
    ok("lead: phone stored", lead.phone === FORM.phone);
    ok("lead: countryCode stored", lead.countryCode === "+91");
    ok("lead: role landed in jobTitle", lead.jobTitle === FORM.role);
    ok("lead: attendeeType stored", lead.attendeeType === "Professional");
    ok("lead: linkedin stored", lead.linkedinUrl === FORM.linkedinUrl);
    ok("lead: college nulled for a professional", lead.collegeName === null);
    ok("lead: source is form", lead.source === "form");
    ok("lead: detailsConfirmedAt stamped", Boolean(lead.detailsConfirmedAt));
    ok("lead: owned by the session user", lead.userId === user.id);

    await one.reload();
    ok("viewCount bumped by the form pass", one.viewCount === 1);

    /* ── the same recording again ────────────────────────────────────────── */
    res = await authed(getWatchState, token, {
      query: { recordingId: one.id },
    });
    ok("probe: now unlocked", res.body.data.unlocked === true);
    ok("probe: unlocked returns the video", res.body.data.video.videoId === "probeVID001");
    await one.reload();
    ok("probe does not bump viewCount", one.viewCount === 1);

    /* ── a second recording: one click, no form ──────────────────────────── */
    res = await authed(getWatchState, token, {
      query: { recordingId: two.id },
    });
    ok("second: not unlocked", res.body.data.unlocked === false);
    ok("second: has a profile", res.body.data.hasProfile === true);
    ok("second: no confirmation needed", res.body.data.needsConfirm === false);
    ok("second: prefill uses their own answer", res.body.data.prefill.role === FORM.role);

    res = await authed(createRecordingLead, token, {
      body: { recordingId: two.id },
    });
    ok("carry is 201", res.status === 201);
    ok("carry returns the video", res.body.data.video.videoId === "probeVID001");

    const carried = await RecordingLead.findOne({ where: { recordingId: two.id } });
    ok("carry: source is carried", carried.source === "carried");
    ok("carry: details copied", carried.jobTitle === FORM.role);
    ok(
      "carry: detailsConfirmedAt copied unchanged",
      new Date(carried.detailsConfirmedAt).getTime() ===
        new Date(lead.detailsConfirmedAt).getTime()
    );

    /* ── a carry aimed at a recording already passed writes nothing ──────── */
    const beforeCount = await RecordingLead.count({ where: { userId: user.id } });
    res = await authed(createRecordingLead, token, {
      body: { recordingId: two.id },
    });
    ok("repeat carry is 200", res.status === 200);
    ok(
      "repeat carry writes no row",
      (await RecordingLead.count({ where: { userId: user.id } })) === beforeCount
    );

    /* ── stale details ───────────────────────────────────────────────────── */
    const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await RecordingLead.update(
      { detailsConfirmedAt: longAgo },
      { where: { userId: user.id } }
    );

    res = await authed(getWatchState, token, {
      query: { recordingId: three.id },
    });
    ok("stale: has a profile", res.body.data.hasProfile === true);
    ok("stale: needs a confirmation", res.body.data.needsConfirm === true);

    res = await authed(createRecordingLead, token, {
      body: { recordingId: three.id },
    });
    ok("stale carry is 422", res.status === 422);
    ok("stale carry asks for a confirmation", res.body.needsConfirm === true);

    /* ── confirming ──────────────────────────────────────────────────────── */
    res = await authed(createRecordingLead, token, {
      body: { recordingId: three.id, ...FORM, role: "Senior PM @ Probe" },
    });
    ok("confirmation is 201", res.status === 201);
    const confirmed = await RecordingLead.findOne({ where: { recordingId: three.id } });
    ok("confirmation stores the edit", confirmed.jobTitle === "Senior PM @ Probe");
    ok(
      "confirmation resets the window",
      new Date(confirmed.detailsConfirmedAt).getTime() > longAgo.getTime()
    );

    /* ── confirmOnly does not count as a watch ───────────────────────────── */
    await three.reload();
    const viewsBefore = three.viewCount;
    res = await authed(createRecordingLead, token, {
      body: { recordingId: three.id, ...FORM, confirmOnly: true },
    });
    ok("confirmOnly is 200 on an existing row", res.status === 200);
    await three.reload();
    ok("confirmOnly does not bump viewCount", three.viewCount === viewsBefore);

    /* ── a bad attendee type is refused ──────────────────────────────────── */
    res = await authed(createRecordingLead, token, {
      body: { recordingId: one.id, ...FORM, attendeeType: "Alien" },
    });
    ok("unknown attendeeType is a 400", res.status === 400);

    /* ── a repeat submission never counts a second view ──────────────────── */
    await one.reload();
    const oneViewsBefore = one.viewCount;
    res = await authed(createRecordingLead, token, {
      body: { recordingId: one.id, ...FORM, role: "Lead PM @ Probe" },
    });
    ok("resubmitting an existing row is 200", res.status === 200);
    await one.reload();
    ok(
      "a second submission does not count a second view",
      one.viewCount === oneViewsBefore
    );
    ok("viewCount is one per person", one.viewCount === 1);

    /* ── a student keeps only the student fields ─────────────────────────── */
    res = await authed(createRecordingLead, token, {
      body: {
        recordingId: one.id,
        ...FORM,
        attendeeType: "Student",
        collegeName: "Probe University",
        graduationYear: "2029",
      },
    });
    ok("student submit is 200 on an existing row", res.status === 200);
    await lead.reload();
    ok("student: college stored", lead.collegeName === "Probe University");
    ok("student: graduation year stored", lead.graduationYear === "2029");

    /* ── a student whose year has passed is stale regardless of the window ─ */
    await lead.update({
      detailsConfirmedAt: new Date(),
      graduationYear: "2020",
    });
    res = await authed(getWatchState, token, {
      query: { recordingId: three.id },
    });
    // three already has a row, so it stays unlocked — check the rule directly.
    const { isRecordingProfileStale } = require("../constants/recording");
    ok(
      "a graduated student is stale even inside the window",
      isRecordingProfileStale({
        detailsConfirmedAt: new Date(),
        attendeeType: "Student",
        graduationYear: "2020",
      }) === true
    );
  } finally {
    await cleanup();
  }

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(" -", f);
  }

  const left = await RecordingLead.count({
    where: { email: FORM.email.toLowerCase() },
  });
  console.log(`Left behind: ${left} probe leads (should be 0)`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.sequelize.close());
