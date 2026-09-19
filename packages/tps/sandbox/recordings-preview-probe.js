/**
 * Drives the recording preview handshake end to end against the dev database.
 *
 * Creates four throwaway recordings — a draft, a scheduled-ahead one, a live
 * gated one and a live ungated one — walks every branch the handshake can take,
 * then deletes everything it made.
 *
 *   node sandbox/recordings-preview-probe.js
 */
require("dotenv").config();

const jwt = require("jsonwebtoken");
const { ulid } = require("ulid");

const db = require("../models");
const {
  createRecordingPreviewToken,
  verifyRecordingPreviewSession,
} = require("../controllers/recording/previewController");
const {
  getPublicRecordingBySlug,
} = require("../controllers/recording/publicController");
const previewAuth = require("../middlewares/previewAuth");
const requireStaff = require("../middlewares/requireStaff");
const requireUser = require("../middlewares/requireUser");

const { Recording } = db;

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
    handler({ query: {}, body: {}, params: {}, headers: {}, ...req }, res, (err) =>
      reject(err instanceof Error ? err : new Error(String(err)))
    );
  });

/**
 * The public detail read, exactly as the router composes it: `previewAuth`
 * first, then the controller. Running the controller alone would never exercise
 * the scope check, which is the half most worth testing.
 */
const readPublic = (slug, previewToken) =>
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

    const req = {
      query: {},
      body: {},
      params: { slug },
      headers: previewToken ? { "x-preview-token": previewToken } : {},
    };

    previewAuth("recording", "slug")(req, res, () => {
      getPublicRecordingBySlug(req, res, (err) =>
        reject(err instanceof Error ? err : new Error(String(err)))
      );
    });
  });

const makeRecording = ({ title, isPublished, scheduledAt, settings }) =>
  Recording.create({
    id: ulid(),
    slug: `preview-probe-${ulid().toLowerCase()}`,
    title,
    video: {
      provider: "youtube",
      url: "https://youtube.com/watch?v=prevProbe01",
      videoId: "prevProbe01",
    },
    durationMinutes: 42,
    content: {},
    settings: settings ?? {},
    isPublished,
    scheduledAt: scheduledAt ?? null,
    publishedAt: new Date(),
  });

const run = async () => {
  const [draft, scheduled, live, ungated] = await Promise.all([
    makeRecording({ title: "Preview probe draft", isPublished: false }),
    makeRecording({
      title: "Preview probe scheduled",
      isPublished: true,
      // Far enough out that a slow probe cannot walk past it.
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }),
    makeRecording({ title: "Preview probe live", isPublished: true }),
    makeRecording({
      title: "Preview probe ungated",
      isPublished: true,
      settings: { gateVideo: false },
    }),
  ]);

  const cleanup = () =>
    Recording.destroy({
      where: { id: [draft.id, scheduled.id, live.id, ungated.id] },
    });

  try {
    /* ── minting is staff-only ───────────────────────────────────────────── */
    const anon = await call(requireStaff, { headers: {} });
    ok("mint: no token is a 401", anon.status === 401);

    let res = await call(createRecordingPreviewToken, {
      params: { id: "not-a-real-id" },
      staff: { id: 1 },
    });
    ok("mint: unknown recording is a 404", res.status === 404);

    res = await call(createRecordingPreviewToken, {
      params: { id: draft.id },
      staff: { id: 1 },
    });
    ok("mint: is a 201", res.status === 201);
    ok("mint: returns the slug", res.body.data.slug === draft.slug);

    const launch = res.body.data.token;
    ok("mint: returns a token", typeof launch === "string" && launch.length > 0);

    /**
     * The reason the signing key is derived rather than `JWT_SECRET` itself.
     * Both of these verify against `JWT_SECRET` and then read claims off
     * whatever comes back, so a preview token signed with it would be a token
     * they consider authentic — handed out in a URL.
     */
    const asStaff = await call(requireStaff, {
      headers: { authorization: `Bearer ${launch}` },
    });
    ok("a launch token is not a staff token", asStaff.status === 401);

    const asUser = await call(requireUser, {
      headers: { authorization: `Bearer ${launch}` },
    });
    ok("a launch token is not a user token", asUser.status === 401);

    /* ── the draft is invisible until the token is redeemed ──────────────── */
    res = await readPublic(draft.slug);
    ok("draft: 404s publicly", res.status === 404);

    res = await readPublic(draft.slug, launch);
    ok(
      "a launch token is not a session token on the read",
      res.status === 404
    );

    /* ── verifying ───────────────────────────────────────────────────────── */
    res = await call(verifyRecordingPreviewSession, { body: {} });
    ok("verify: no token is a 400", res.status === 400);

    res = await call(verifyRecordingPreviewSession, {
      body: { token: jwt.sign({ typ: "nonsense" }, "wrong-key") },
    });
    ok("verify: a foreign token is a 401", res.status === 401);

    res = await call(verifyRecordingPreviewSession, { body: { token: launch } });
    ok("verify: is a 200", res.status === 200);
    ok("verify: returns this recording's slug", res.body.data.slug === draft.slug);
    ok("verify: reports a life", res.body.data.expiresIn > 0);

    const session = res.body.data.sessionToken;
    ok("verify: returns a session token", typeof session === "string");

    // Single use. The launch token has been sitting in a URL and in browser
    // history since it was minted.
    res = await call(verifyRecordingPreviewSession, { body: { token: launch } });
    ok("verify: the same launch token twice is a 401", res.status === 401);

    // The type claim is what stops the token that leaks being replayed as the
    // one that does not have to be spent.
    res = await call(verifyRecordingPreviewSession, { body: { token: session } });
    ok("verify: a session token is not a launch token", res.status === 401);

    /* ── the draft, with the session token ───────────────────────────────── */
    res = await readPublic(draft.slug, session);
    ok("preview: the draft renders", res.status === 200);
    ok("preview: says it is a preview", res.body.data.isPreview === true);
    ok("preview: reports the draft state", res.body.data.isPublished === false);
    ok(
      "preview: releases the real video",
      res.body.data.previewVideo?.videoId === "prevProbe01"
    );
    ok(
      "preview: the gated block is still redacted",
      res.body.data.video?.videoId === undefined &&
        res.body.data.video?.url === undefined
    );
    ok("preview: still says it is gated", res.body.data.isGated === true);

    /* ── scope ───────────────────────────────────────────────────────────── */
    res = await readPublic(live.slug, session);
    ok("scope: another recording is served publicly", res.status === 200);
    ok("scope: no preview flag on it", res.body.data.isPreview === undefined);
    ok("scope: no video released on it", !res.body.data.previewVideo);

    res = await readPublic(scheduled.slug, session);
    ok(
      "scope: the scheduled one is not opened by another's token",
      res.status === 404
    );

    /* ── a scheduled-ahead recording needs its own token ─────────────────── */
    res = await call(createRecordingPreviewToken, {
      params: { id: scheduled.id },
      staff: { id: 1 },
    });
    res = await call(verifyRecordingPreviewSession, {
      body: { token: res.body.data.token },
    });
    const scheduledSession = res.body.data.sessionToken;

    res = await readPublic(scheduled.slug);
    ok("scheduled: 404s publicly", res.status === 404);

    res = await readPublic(scheduled.slug, scheduledSession);
    ok("scheduled: renders in preview", res.status === 200);
    ok(
      "scheduled: reports it is published and waiting",
      res.body.data.isPublished === true && Boolean(res.body.data.scheduledAt)
    );

    /* ── an ungated recording has nothing to release ─────────────────────── */
    res = await call(createRecordingPreviewToken, {
      params: { id: ungated.id },
      staff: { id: 1 },
    });
    res = await call(verifyRecordingPreviewSession, {
      body: { token: res.body.data.token },
    });
    res = await readPublic(ungated.slug, res.body.data.sessionToken);
    ok("ungated: renders in preview", res.status === 200);
    ok(
      "ungated: ships its video as it always did",
      res.body.data.video?.videoId === "prevProbe01"
    );
    ok("ungated: no separate preview video", !res.body.data.previewVideo);

    /* ── the public response shape is untouched ──────────────────────────── */
    res = await readPublic(live.slug);
    ok("public: the live one renders", res.status === 200);
    ok(
      "public: no preview keys leak into it",
      !("isPreview" in res.body.data) &&
        !("isPublished" in res.body.data) &&
        !("scheduledAt" in res.body.data) &&
        !("previewVideo" in res.body.data)
    );
    ok(
      "public: the gated video is still withheld",
      res.body.data.video?.videoId === undefined
    );
  } finally {
    await cleanup();
  }

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(" -", f);
  }

  const left = await Recording.count({
    where: { slug: { [db.Sequelize.Op.like]: "preview-probe-%" } },
  });
  console.log(`Left behind: ${left} probe recordings (should be 0)`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.sequelize.close());
