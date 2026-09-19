const { Op } = require("sequelize");

const db = require("../../models");
const asyncWrapper = require("../../utils/asyncWrapper");
const { getMeta, getPaginationParams } = require("../../utils/pagination");
const {
  RECORDING_ATTENDEE_TYPES,
  RECORDING_LEAD_SOURCE,
  isRecordingProfileStale,
  resolveRecordingSettings,
} = require("../../constants/recording");
const {
  buildGatePrefill,
  carryProfileFields,
  resolveWatchProfile,
} = require("../../service/recording/watchProfile");

const { Recording, RecordingLead } = db;

/**
 * The gate — the only place a gated recording's video URL is emitted.
 *
 * Two endpoints, both behind `requireUser`, because watching a gated recording
 * requires an account:
 *
 *   GET  /recordings/public/watch-state   what this person needs to do next
 *   POST /recordings/public/leads         do it, and hand back the video
 *
 * **An ungated recording (`settings.gateVideo: false`) is not affected by any
 * of this.** That switch means "this one plays for anybody", and it still does
 * — the public payload carries its video and no signed-in state is consulted.
 * Neither endpoint below is on the path a visitor takes to one.
 *
 * ── Why the form is not asked every time ────────────────────────────────────
 *
 * It is nine fields. Somebody working through four recordings would fill it
 * four times, which is the surest way to lose them halfway. So the first pass
 * asks, and later recordings **carry** the answers forward: one click, a real
 * lead row for the new recording, no form.
 *
 * Carried details go stale — people change jobs, students graduate — so the
 * carry expires. `isRecordingProfileStale` holds both rules and why each is
 * there.
 *
 * **A repeat submission is a 200, not a 409.** Somebody confirming their
 * details has done nothing wrong. The row is updated rather than inserted,
 * which is what keeps `RecordingLeads` a list of people rather than a list of
 * page loads — and what stops the workflow trigger firing again, since it hangs
 * off `afterCreate`.
 */

const trimmed = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** The block every response that unlocks a video returns. */
const videoPayload = (recording) => ({
  provider: recording.video.provider ?? "youtube",
  url: recording.video.url,
  videoId: recording.video.videoId,
});

/**
 * This account's lead for one recording, if it has one.
 *
 * **Keyed on `userId` first, and that is the point.** The form's email is
 * editable, so somebody can pass the gate under a work address that is not the
 * one they signed up with. Looking the row up by the account's email would then
 * never find it, and they would be asked to fill the form again on every visit
 * to a recording they had already unlocked.
 *
 * The email arm of the `OR` is for rows written before accounts were required,
 * which have no `userId` to find them by. Those get claimed on the way past.
 */
const findOwnLead = (recordingId, user) =>
  RecordingLead.findOne({
    where: {
      recordingId,
      [Op.or]: [{ userId: user.id }, { email: user.email }],
    },
    // A tie can only happen where a legacy row and an owned row both exist;
    // the owned one is this account's real history, so prefer it.
    order: [[db.Sequelize.literal(`("userId" IS NULL)`), "ASC"]],
  });

/**
 * The live, watchable recording behind an id, or a response describing why not.
 *
 * Shared by both endpoints so a recording whose video was cleared after
 * publishing gives the same answer to the probe and to the submission — a
 * player that offers to unlock and then fails is worse than one that says up
 * front that it cannot.
 */
const loadWatchableRecording = async (recordingId, res) => {
  if (!recordingId) {
    res.status(400).json({ success: false, message: "Recording is required" });
    return null;
  }

  const recording = await Recording.findOne({
    where: { id: recordingId, isPublished: true },
  });

  if (!recording) {
    res.status(404).json({ success: false, message: "Recording not found" });
    return null;
  }

  if (!recording.video?.videoId) {
    // Publishing checks for this, so reaching it means the video was cleared
    // afterwards. Better a plain message than an empty player.
    res.status(409).json({
      success: false,
      message: "This recording is not available to watch yet.",
    });
    return null;
  }

  return recording;
};

/**
 * What the player should draw, before anybody clicks anything.
 *
 * **Writes no lead row and does not touch `viewCount`.** Opening a page is not
 * watching, and a probe that recorded one would make both numbers count page
 * loads instead. The one write it does make is repair: claiming an unclaimed
 * lead row for the account whose address it carries, which changes nothing
 * anybody can observe.
 *
 * Four answers, in the order the player checks them:
 *
 *   unlocked                  already has a lead for this recording. The video
 *                             comes straight back — they earned it, and a
 *                             second pass would be a page-load counter.
 *   !hasProfile               never filled the form. The full one.
 *   hasProfile, needsConfirm  filled it, but the answers have gone stale. The
 *                             same form, prefilled, as a confirmation.
 *   hasProfile                one click, no form.
 */
const getWatchState = asyncWrapper(async (req, res) => {
  const recording = await loadWatchableRecording(req.query.recordingId, res);
  if (!recording) return undefined;

  const user = req.appUser;

  /**
   * An ungated recording never reaches here from the website — its video ships
   * with the page. Answered honestly rather than 400'd, so a client that asks
   * anyway is told the truth instead of being handed an error to render.
   */
  if (!resolveRecordingSettings(recording).gateVideo) {
    return res.status(200).json({
      success: true,
      data: {
        unlocked: true,
        video: videoPayload(recording),
        hasProfile: true,
        needsConfirm: false,
        prefill: buildGatePrefill(user, null),
      },
    });
  }

  const existing = await findOwnLead(recording.id, user);

  if (existing) {
    if (!existing.userId) {
      // Written before accounts were required. Claim it quietly; failing a
      // page load over a denormalised link would be a poor trade.
      try {
        await existing.update({ userId: user.id });
      } catch {
        // The unlock below is correct either way.
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        unlocked: true,
        video: videoPayload(recording),
        hasProfile: true,
        needsConfirm: false,
        prefill: buildGatePrefill(user, existing),
      },
    });
  }

  const profile = await resolveWatchProfile(user);

  return res.status(200).json({
    success: true,
    data: {
      unlocked: false,
      hasProfile: Boolean(profile),
      needsConfirm: Boolean(profile) && isRecordingProfileStale(profile),
      prefill: buildGatePrefill(user, profile),
    },
  });
});

/**
 * Pass the gate for one recording, and get the video back.
 *
 * The body is **optional**. Sent, it is a person filling or confirming the
 * form. Omitted, it is the carry path — they clicked play on a recording they
 * have not seen, and their most recently confirmed details are copied onto a
 * new row for it. With neither a body nor a profile there is nothing to write,
 * which is a 422 telling the client to show the form, not an error.
 *
 * **`userId` is not negotiable.** It comes from the session on every write, so
 * an edited address changes what we contact somebody on and never whose row it
 * is. That is also what `findOwnLead` keys on, so passing the gate under a work
 * address does not hide the row from the person who created it.
 */
const createRecordingLead = asyncWrapper(async (req, res) => {
  const recordingId = req.query.recordingId || req.body?.recordingId;

  const recording = await loadWatchableRecording(recordingId, res);
  if (!recording) return undefined;

  const user = req.appUser;

  const {
    name,
    email,
    phone,
    countryCode,
    // The form's "Current role / company". `EventGuests` calls this `role`, and
    // the gate posts that name — it is the same fact, and it lands in the
    // `jobTitle` column. This line is the whole mapping.
    role,
    jobTitle,
    attendeeType,
    collegeName,
    graduationYear,
    linkedinUrl,
    additionalData,
    /**
     * Refresh the details without counting a watch.
     *
     * **Nothing on the website sends this today** — the "update my details"
     * link it was built for was removed. It is kept because it is the only
     * thing standing between a future update path and a corrupted `viewCount`:
     * without it, any caller that saves details would silently register a view.
     */
    confirmOnly,
  } = req.body ?? {};

  /**
   * A submission is a body carrying the form's own required fields, not merely
   * a non-empty body. `recordingId` and `confirmOnly` both arrive in the body
   * on the carry path, and treating either as "they filled the form" would
   * write an empty profile over a good one.
   */
  const submitted = Boolean(trimmed(name) || trimmed(attendeeType));

  /**
   * Only the shape is enforced here, not the form's conditional rules.
   *
   * The form already refuses to submit without a name, a valid phone for the
   * chosen country, and the role-or-college pair the attendee toggle makes
   * mandatory. Re-deriving that branch server-side would be a second copy of a
   * rule that changes, and the two would drift.
   *
   * What is checked is what the database cares about: an `attendeeType` that is
   * one of the two the column is documented to hold — because that one arrives
   * from a toggle and would otherwise let anything posting directly write a
   * third value nothing renders.
   */
  if (attendeeType && !RECORDING_ATTENDEE_TYPES.includes(attendeeType)) {
    return res.status(400).json({
      success: false,
      message: "attendeeType must be Professional or Student",
    });
  }

  const existing = await findOwnLead(recording.id, user);

  /**
   * A carry aimed at a recording they have already passed. The probe would
   * normally have unlocked it without a request at all, so this is a stale
   * client or a double click — and the answer is the video, not a write.
   *
   * Writing would be actively wrong: carrying onto an existing row would stamp
   * `source: "carried"` over a row somebody actually filled a form for, and
   * overwrite its `detailsConfirmedAt` with an older one.
   */
  if (!submitted && existing) {
    return res.status(200).json({
      success: true,
      data: {
        video: videoPayload(recording),
        lead: {
          id: existing.id,
          detailsConfirmedAt: existing.detailsConfirmedAt,
        },
      },
    });
  }

  /**
   * Nothing typed — so this is a carry, and there are two ways it can fail.
   *
   * Both answer 422 with `needsProfile` rather than 400: the client's job is to
   * open the form, and neither case is an error. `needsConfirm` distinguishes
   * "we have never met" from "check these over", which is the difference
   * between the two headings the dialog can show.
   *
   * **The staleness check has to live here, not only in the probe.** The probe
   * is advice; this is the write. Without it, a client that ignored
   * `needsConfirm` — a stale tab, a replayed request, a future caller — would
   * carry the same details forward indefinitely and the window would never once
   * be enforced on anything that matters.
   */
  const profile = submitted ? null : await resolveWatchProfile(user);

  if (!submitted && !profile) {
    return res.status(422).json({
      success: false,
      needsProfile: true,
      needsConfirm: false,
      message: "Tell us a little about yourself to watch this recording.",
    });
  }

  if (!submitted && isRecordingProfileStale(profile)) {
    return res.status(422).json({
      success: false,
      needsProfile: true,
      needsConfirm: true,
      message: "Please confirm your details are still up to date.",
    });
  }

  const now = new Date();

  /**
   * The address they typed, or the account's if they cleared it.
   *
   * Editable on purpose: a personal sign-up address is often not the one
   * somebody wants a course team writing to. What the session fixes is
   * `userId`, below — an edited address changes what we contact them on, never
   * whose row it is.
   */
  const resolvedEmail = submitted
    ? (trimmed(email)?.toLowerCase() ?? String(user.email).toLowerCase())
    : (profile.email ?? String(user.email).toLowerCase());

  /**
   * Typed details win outright, including a cleared optional field.
   *
   * Every submission is a deliberate act by a signed-in person against a
   * prefilled form — so when they change an answer, changing it is the entire
   * point, and refusing to overwrite would make the confirmation cosmetic. The
   * only field that can go from set to null this way is `linkedinUrl`; the rest
   * are required by the form.
   */
  const details = submitted
    ? {
        name: trimmed(name),
        email: resolvedEmail,
        phone: trimmed(phone),
        countryCode: trimmed(countryCode),
        jobTitle: trimmed(role) ?? trimmed(jobTitle),
        attendeeType: trimmed(attendeeType),
        // Held to the branch that produced them. A professional who once
        // submitted as a student would otherwise keep a college name that
        // contradicts their own attendee type, and the manage table would show
        // both.
        collegeName: attendeeType === "Student" ? trimmed(collegeName) : null,
        graduationYear:
          attendeeType === "Student" ? trimmed(graduationYear) : null,
        linkedinUrl: trimmed(linkedinUrl),
        detailsConfirmedAt: now,
        source: RECORDING_LEAD_SOURCE.FORM,
      }
    : {
        ...carryProfileFields(profile),
        source: RECORDING_LEAD_SOURCE.CARRIED,
      };

  let lead = existing;

  try {
    if (existing) {
      // Only a submission reaches here — the carry path returned above.
      await existing.update({
        ...details,
        submissionCount: existing.submissionCount + 1,
        lastSubmittedAt: now,
        userId: existing.userId ?? user.id,
      });
    } else {
      lead = await RecordingLead.create({
        ...details,
        recordingId: recording.id,
        email: resolvedEmail,
        userId: user.id,
        lastSubmittedAt: now,
        /**
         * Captured fresh, never carried. UTM and referrer describe how somebody
         * arrived at *this* recording; copying an old campaign's parameters
         * onto a later visit would credit a campaign that had already ended.
         */
        additionalData: additionalData ?? {},
      });
    }
  } catch (err) {
    /**
     * The table is unique on (recordingId, email), and the address is typed
     * now — so somebody can aim at one another account already used here.
     *
     * Named rather than left to the generic error the handler would give,
     * because "that email is already registered" is actionable and "duplicate
     * key value violates unique constraint" is not. It is not a security answer
     * either way: they are told nothing they did not just type.
     */
    if (err?.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message:
          "That email address has already been used for this recording. Try another, or use the one you signed in with.",
      });
    }

    throw err;
  }

  /**
   * **One per person, ever.** Only a newly created lead row moves it, and there
   * is exactly one row per (recording, account) — so this counts the distinct
   * people who have unlocked this recording, not how many times they pressed
   * play.
   *
   * The probe does not touch it either: opening a page is not watching.
   *
   * `confirmOnly` can only ever target an existing row, so the `existing` test
   * already covers it; it is named anyway because the alternative is a reader
   * having to prove that to themselves.
   */
  if (!existing && !confirmOnly) await recording.increment("viewCount");

  return res.status(existing ? 200 : 201).json({
    success: true,
    data: {
      video: videoPayload(recording),
      lead: { id: lead.id, detailsConfirmedAt: lead.detailsConfirmedAt },
    },
  });
});

const listRecordingLeads = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { recordingId, email } = req.query;

  const where = {};

  if (recordingId) where.recordingId = recordingId;

  // Partial, case-insensitive. This backs a search box, and an exact match is no
  // use in one: nobody types a whole address to find a row they are already
  // looking at, they type the domain or the first few letters.
  if (email) {
    where.email = { [Op.iLike]: `%${String(email).trim().toLowerCase()}%` };
  }

  const { rows, count } = await RecordingLead.findAndCountAll({
    where,
    include: [
      {
        model: Recording,
        as: "recording",
        attributes: ["id", "title", "slug"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return res.status(200).json({
    success: true,
    data: rows,
    meta: getMeta(count, page, limit),
  });
});

module.exports = {
  getWatchState,
  createRecordingLead,
  listRecordingLeads,
};
