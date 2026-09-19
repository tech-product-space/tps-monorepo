const psEnv = require("@ps/env/crm");
const { Op } = require("sequelize");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const {
  sequelize,
  LeadProfile,
  LeadProfileDetails,
  LeadCourse,
  OnboardingOtp,
  Activity,
} = require("../models");

const { ENROLLMENT_STATUS } = require("../config/constants/enrollment");
const {
  OTP,
  COMPLETION_FIELDS,
  PHONE_VERIFIED_SOURCE,
  ERROR_CODE,
} = require("../config/constants/onboarding");

const { generateOtp, hashOtp, verifyOtpHash } = require("../utils/helper/otp");
const {
  signOtpToken,
  verifyOtpToken,
  signSessionToken,
} = require("../utils/helper/onboardingToken");
const sendOtp = require("./whatsapp/sendOtp");
const { validateProfilePayload } = require("./onboardingProfile.validator");

/**
 * Everything behind onboarding.theproductspace.in.
 *
 * See ONBOARDING_PORTAL_PLAN.md. The two things worth knowing before editing:
 *
 *  1. Eligibility is checked BEFORE any WhatsApp message is sent. That leaks
 *     whether a number is enrolled — accepted deliberately, because the
 *     alternative is paying Meta to message arbitrary strangers on demand.
 *     Every eligibility failure returns the same code and the same message.
 *
 *  2. lead_profiles.phone is digits-only but inconsistently includes the
 *     country code (see resolveProfileByPhone). Exact match alone silently
 *     locks real students out.
 */

/* ─── A typed failure the controllers translate into HTTP ──────────────────── */

class OnboardingError extends Error {
  constructor(code, message, { status = 400, meta = {} } = {}) {
    super(message);
    this.name = "OnboardingError";
    this.code = code;
    this.status = status;
    this.meta = meta;
  }
}

const digitsOnly = (v) => String(v ?? "").replace(/\D/g, "");

/* ─── Phone resolution ─────────────────────────────────────────────────────── */

/**
 * Of the readings we can make of what was typed, the one that is actually a
 * dialable number in this country — or null if none is.
 *
 * The lookup can afford to try every reading against the database; the
 * WhatsApp send cannot, because it dials exactly one number and a wrong guess
 * costs a template message and shows the student a delivery error.
 *
 * @returns {string|null} the canonical national number, digits only
 */
function pickDialable(cc, readings) {
  for (const reading of readings) {
    if (!reading) continue;
    try {
      const parsed = parsePhoneNumberFromString(`+${cc}${reading}`);
      if (parsed?.isValid()) return String(parsed.nationalNumber);
    } catch {
      // Malformed input is not exceptional here — strangers can hit /start.
    }
  }
  return null;
}

/**
 * Reduce whatever a student typed to a country code plus a national number.
 *
 * They routinely type the country code into the number box as well as picking
 * it from the dropdown — "+91 97694-38216" with India already selected. Left
 * alone that produces two failures at once: the lookup misses (the profile is
 * stored as ten digits), and the WhatsApp message goes to 91919769438216,
 * which is nobody.
 *
 * Both readings are kept rather than one being chosen, because a national
 * number can legitimately begin with its own country code — 9187654321 is a
 * valid Indian mobile. Guessing would lose that person; trying both costs one
 * extra indexed lookup.
 */
function normalisePhoneInput(countryCode, rawPhone) {
  const cc = digitsOnly(countryCode) || "91";
  const raw = digitsOnly(rawPhone);

  // Reading A: they typed the national number (possibly with a leading 0).
  const withoutLeadingZeros = raw.replace(/^0+/, "");

  // Reading B: they typed the country code too.
  const ccStripped =
    raw.startsWith(cc) && raw.length - cc.length >= 6
      ? raw.slice(cc.length).replace(/^0+/, "")
      : null;

  // What we dial and what we length-check against.
  //
  // Prefix-matching alone CANNOT choose between the two readings, and choosing
  // wrong means dialling a number that does not exist. Kazakh mobiles sit under
  // +7 and their national numbers genuinely begin with 7, so stripping that 7
  // as a duplicated country code drops two digits and earns a DELIVERY_FAILED —
  // which is exactly how this was found. An Indian number typed with 91 in the
  // box is the same shape and wants the opposite answer. libphonenumber knows
  // each country's real national lengths and prefixes, so it settles both.
  // Cases worth not breaking are in scripts/check-phone.js.
  //
  // Reading A is offered first: it is what the student literally typed, and B
  // only earns the number when A is not a valid one.
  //
  // No reading validated — an unusual number, a country libphonenumber has no
  // metadata for, or genuine junk that resolveProfileByPhone will reject a few
  // lines later — falls back to the old heuristic rather than refusing.
  const national =
    pickDialable(cc, [withoutLeadingZeros, ccStripped, raw]) ??
    (ccStripped || withoutLeadingZeros || raw);

  // Every stored form the profile might be under, in cheapest-first order.
  const candidates = [
    ...new Set(
      [
        raw,
        withoutLeadingZeros,
        ccStripped,
        `${cc}${national}`,
        `0${national}`,
      ].filter((v) => v && v.length >= 6),
    ),
  ];

  return { cc, national, candidates };
}

/**
 * Find the one lead_profile that owns this phone number.
 *
 * lead_profiles.phone holds digits only, but WHICH digits depends on how the
 * lead arrived:
 *
 *   meta.service.js / webhook/cal.controller.js -> national number, CC split
 *                                                  into country_code
 *   lead.service.js (manual create)             -> whatever the agent typed
 *   lead.import.controller.js (CSV)             -> whatever was in the sheet
 *
 * So the same person can be stored as 9876543210, 919876543210 or 09876543210.
 * We try each, then fall back to a suffix match — and REFUSE TO GUESS if that
 * matches more than one person. Handing one student's profile to another
 * because two numbers share a tail is the worst thing this endpoint could do.
 *
 * @returns {Promise<LeadProfile|null>}
 * @throws  {OnboardingError} NOT_ELIGIBLE when the suffix match is ambiguous
 */
async function resolveProfileByPhone(countryCode, rawPhone) {
  const { national, candidates } = normalisePhoneInput(countryCode, rawPhone);

  if (national.length < 6 || national.length > 15) {
    throw new OnboardingError(
      ERROR_CODE.INVALID_PHONE,
      "Please enter a valid phone number.",
    );
  }

  // Steps 1–3: exact matches, cheapest first. `phone` is UNIQUE, so each of
  // these is a single indexed lookup returning at most one row.
  for (const phone of candidates) {
    const hit = await LeadProfile.findOne({ where: { phone } });
    if (hit) return hit;
  }

  // Step 4: suffix match. Leading wildcard means a sequential scan — acceptable
  // only because this path is rate-limited to a handful of hits per IP per
  // quarter hour and is reached only when all three exact matches missed.
  //
  // Nine digits, not ten: it is long enough that a collision across a few tens
  // of thousands of profiles is a real surprise, and short enough to survive a
  // stored number that is missing or gaining a leading digit.
  const suffix = national.slice(-9);
  if (suffix.length < 9) return null;

  const loose = await LeadProfile.findAll({
    where: {
      [Op.and]: [
        { phone: { [Op.like]: `%${suffix}` } },
        // The only legitimate reason an exact match missed is that the stored
        // number carries EXTRA leading digits (a country code, or a leading 0).
        // A stored number SHORTER than what was typed is truncated junk — and
        // this database has 118 such rows at 8–9 digits, any of which would
        // otherwise suffix-match a real 10-digit number and hand that student's
        // session to the wrong profile. Length is what tells the two apart.
        //
        // Both conditions must be separate entries in an Op.and array: as two
        // `phone:` keys in one object literal, the second would silently
        // replace the first and the LIKE would vanish.
        sequelize.where(sequelize.fn("length", sequelize.col("phone")), {
          [Op.gte]: national.length,
        }),
      ],
    },
    limit: 5,
  });

  if (loose.length === 1) return loose[0];

  if (loose.length > 1) {
    // Someone needs to merge these. Log loudly; tell the student nothing.
    console.warn(
      `[onboarding] PHONE_AMBIGUOUS suffix=${suffix} profiles=${loose
        .map((p) => p.id)
        .join(",")}`,
    );
    throw new OnboardingError(
      ERROR_CODE.NOT_ELIGIBLE,
      "not eligible",
      { status: 404 },
    );
  }

  return null;
}

/* ─── Eligibility ──────────────────────────────────────────────────────────── */

/**
 * Active enrollments for a profile, newest first.
 *
 * `status = 'active'` is the whole gate. A paid payment is deliberately NOT
 * also required: onboarding emails only go out after money lands, so the two
 * are near-equivalent in practice, and the stricter rule would lock out anyone
 * enrolled manually ahead of payment.
 *
 * Re-enrollments are 'active' too, so a returning student gets in — which is
 * correct, they are on the programme.
 */
async function getActiveEnrollments(leadProfileId) {
  return LeadCourse.findAll({
    where: {
      lead_profile_id: leadProfileId,
      status: ENROLLMENT_STATUS.ACTIVE,
    },
    attributes: ["id", "course_id", "program_name", "cohort_name", "created_at"],
    order: [["created_at", "DESC"]],
  });
}

/* ─── OTP challenge ────────────────────────────────────────────────────────── */

/**
 * Resolve → check eligibility → mint a challenge → send it over WhatsApp.
 *
 * Throws NOT_ELIGIBLE (404) for every failure mode the student could probe:
 * unknown number, no enrollment, dropped-only, ambiguous match. The controller
 * renders one message for all of them.
 */
async function startChallenge({ countryCode, phone }) {
  const profile = await resolveProfileByPhone(countryCode, phone);
  if (!profile) {
    throw new OnboardingError(ERROR_CODE.NOT_ELIGIBLE, "not eligible", {
      status: 404,
    });
  }

  const enrollments = await getActiveEnrollments(profile.id);
  if (enrollments.length === 0) {
    throw new OnboardingError(ERROR_CODE.NOT_ELIGIBLE, "not eligible", {
      status: 404,
    });
  }

  // A fresh attempt supersedes anything in flight, so an abandoned challenge
  // can never be used to burn the attempt counter of a live one.
  await OnboardingOtp.destroy({ where: { lead_profile_id: profile.id } });

  // Dial the number the STUDENT gave, not the one on file — the profile's
  // stored form may be missing the country code (see resolveProfileByPhone),
  // and WhatsApp needs the full international number. `national` is the
  // normalised form, so a student who typed "+91 …" with India selected does
  // not get messaged at 91919769438216.
  const { cc, national } = normalisePhoneInput(countryCode, phone);
  const dialable = `${cc}${national}`;

  const code = generateOtp(OTP.LENGTH);
  const row = await OnboardingOtp.create({
    lead_profile_id: profile.id,
    phone: dialable,
    country_code: `+${cc}`,
    otp_hash: await hashOtp(code),
    expires_at: new Date(Date.now() + OTP.TTL_MS),
    last_sent_at: new Date(),
  });

  await deliver(dialable, code);

  return {
    otpToken: signOtpToken({ otpId: row.id, leadProfileId: profile.id }),
    expiresIn: Math.floor(OTP.TTL_MS / 1000),
    resendIn: Math.floor(OTP.RESEND_COOLDOWN_MS / 1000),
    phoneMasked: maskPhone(cc, national),
  };
}

/**
 * Send, or print in development.
 *
 * A delivery failure is surfaced to the student rather than swallowed: unlike
 * an onboarding email, this message IS the flow — silently "succeeding" leaves
 * them staring at a code entry box waiting for something that will never come.
 */
async function deliver(dialable, code) {
  if (psEnv.OTP_MODE !== "live") {
    console.log(`[onboarding] OTP for ${dialable}: ${code}`);
    return;
  }

  try {
    await sendOtp(dialable, code);
  } catch (err) {
    console.error(
      "[onboarding] WhatsApp send failed:",
      err.response?.data || err.message,
    );
    throw new OnboardingError(
      "DELIVERY_FAILED",
      "We couldn't send the code to WhatsApp just now. Please try again in a minute.",
      { status: 502 },
    );
  }
}

/** +91 98xxxx8877 — enough to recognise, not enough to disclose. */
function maskPhone(cc, national) {
  if (national.length <= 4) return `+${cc} ${national}`;
  const head = national.slice(0, 2);
  const tail = national.slice(-4);
  const middle = "x".repeat(Math.max(0, national.length - 6));
  return `+${cc} ${head}${middle}${tail}`;
}

/**
 * adi***@gmail.com — same stance as maskPhone.
 *
 * The portal shows this so a student can answer "is that still the right
 * address?" before deciding whether to give us an alternate. Enough of the
 * local part survives to recognise it; the domain is left alone because that is
 * what makes it recognisable at a glance.
 */
function maskEmail(email) {
  const raw = String(email || "").trim();
  if (!raw || !raw.includes("@")) return null;

  const [local, domain] = raw.split("@");
  if (local.length <= 3) return `${local[0] || ""}***@${domain}`;
  return `${local.slice(0, 3)}***@${domain}`;
}

/**
 * Load the challenge a token points at, with the token's own claims checked.
 * Returns { row, payload }.
 */
async function loadChallenge(otpToken) {
  let payload;
  try {
    payload = verifyOtpToken(otpToken);
  } catch {
    throw new OnboardingError(
      ERROR_CODE.OTP_EXPIRED,
      "That code has expired. Please start again.",
      { status: 400 },
    );
  }

  const row = await OnboardingOtp.findByPk(payload.otpId);
  if (!row) {
    throw new OnboardingError(
      ERROR_CODE.OTP_EXPIRED,
      "That code has expired. Please start again.",
      { status: 400 },
    );
  }

  // The token carries the profile id as well as the row id; if they disagree,
  // something is very wrong. Cheap to check, and it means a forged token would
  // need both halves consistent even if the secret ever leaked.
  if (row.lead_profile_id !== payload.leadProfileId) {
    throw new OnboardingError(ERROR_CODE.SESSION_INVALID, "Invalid request.", {
      status: 400,
    });
  }

  return { row, payload };
}

/**
 * Check the code. On success the row is deleted (one-time use), the profile's
 * phone is marked verified, and a 30-minute session token is issued.
 */
async function verifyChallenge({ otpToken, otp }) {
  const { row } = await loadChallenge(otpToken);

  if (row.isExpired()) {
    await row.destroy();
    throw new OnboardingError(
      ERROR_CODE.OTP_EXPIRED,
      "That code has expired. Please request a new one.",
      { status: 400 },
    );
  }

  if (row.attempts >= OTP.MAX_ATTEMPTS) {
    throw new OnboardingError(
      ERROR_CODE.OTP_ATTEMPTS_EXCEEDED,
      "Too many incorrect attempts. Please start again.",
      { status: 429 },
    );
  }

  const valid = await verifyOtpHash(digitsOnly(otp), row.otp_hash);
  if (!valid) {
    row.attempts += 1;
    await row.save();

    const left = Math.max(0, OTP.MAX_ATTEMPTS - row.attempts);
    throw new OnboardingError(
      ERROR_CODE.OTP_INVALID,
      left > 0
        ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`
        : "Too many incorrect attempts. Please start again.",
      { status: 400, meta: { attemptsLeft: left } },
    );
  }

  const profile = await LeadProfile.findByPk(row.lead_profile_id);
  if (!profile) {
    await row.destroy();
    throw new OnboardingError(ERROR_CODE.NOT_ELIGIBLE, "not eligible", {
      status: 404,
    });
  }

  // Re-check eligibility at the moment of verification, not just at /start.
  // A drop processed in between should stop them here.
  const enrollments = await getActiveEnrollments(profile.id);
  if (enrollments.length === 0) {
    await row.destroy();
    throw new OnboardingError(ERROR_CODE.NOT_ELIGIBLE, "not eligible", {
      status: 404,
    });
  }

  // One-time use.
  await row.destroy();

  // The only write this flow makes to lead_profiles, and deliberately a
  // targeted two-column update rather than profile.save() — `phone` is UNIQUE
  // and dedup-critical and must stay unreachable from anonymous code.
  if (!profile.phone_verified) {
    await LeadProfile.update(
      {
        phone_verified: true,
        phone_verified_source: PHONE_VERIFIED_SOURCE,
      },
      { where: { id: profile.id } },
    );
  }

  return {
    sessionToken: signSessionToken({ leadProfileId: profile.id }),
    expiresIn: OTP.SESSION_TTL_SECONDS,
  };
}

/**
 * New code on the same challenge. Rotates the token so the old one dies with
 * the old code.
 */
async function resendChallenge({ otpToken }) {
  const { row } = await loadChallenge(otpToken);

  const since = Date.now() - new Date(row.last_sent_at).getTime();
  if (since < OTP.RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((OTP.RESEND_COOLDOWN_MS - since) / 1000);
    throw new OnboardingError(
      ERROR_CODE.RESEND_COOLDOWN,
      `Please wait ${wait}s before asking for another code.`,
      { status: 429, meta: { retryAfter: wait } },
    );
  }

  if (row.resend_count >= OTP.MAX_RESENDS) {
    throw new OnboardingError(
      ERROR_CODE.RESEND_LIMIT,
      "You've requested too many codes. Please start again in a little while.",
      { status: 429 },
    );
  }

  const code = generateOtp(OTP.LENGTH);
  row.otp_hash = await hashOtp(code);
  // Attempts reset with the code: the five tries belong to the code that was
  // sent, and a student who mistyped the old one is not out of chances.
  row.attempts = 0;
  row.resend_count += 1;
  row.expires_at = new Date(Date.now() + OTP.TTL_MS);
  row.last_sent_at = new Date();
  await row.save();

  await deliver(row.phone, code);

  return {
    otpToken: signOtpToken({
      otpId: row.id,
      leadProfileId: row.lead_profile_id,
    }),
    expiresIn: Math.floor(OTP.TTL_MS / 1000),
    resendIn: Math.floor(OTP.RESEND_COOLDOWN_MS / 1000),
    resendsLeft: OTP.MAX_RESENDS - row.resend_count,
  };
}

/* ─── Details ──────────────────────────────────────────────────────────────── */

async function getDetails(leadProfileId) {
  return LeadProfileDetails.findByPk(leadProfileId);
}

/**
 * 0–100, across COMPLETION_FIELDS. Optional fields count, so a profile with a
 * resume link reads as more complete than one without even though we never
 * require it.
 */
function completionPercent(details) {
  if (!details) return 0;
  const filled = COMPLETION_FIELDS.filter((f) => {
    const v = details[f];
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    // target_roles is an ARRAY column that defaults to []. Without this branch
    // an unanswered multi-select counts as answered, because [] is truthy.
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
  return Math.round((filled / COMPLETION_FIELDS.length) * 100);
}

/**
 * Has this person filled the form in at all? Drives whether the onboarding
 * email still asks them to.
 */
async function isProfileComplete(leadProfileId) {
  const row = await LeadProfileDetails.findByPk(leadProfileId, {
    attributes: ["submission_count"],
  });
  return Boolean(row && row.submission_count > 0);
}

/**
 * Validate and upsert. Re-submission is allowed and expected — the student owns
 * this data and re-verifies by OTP every time they come back — so this is an
 * upsert with a submission counter rather than a create.
 */
async function submitDetails({ leadProfileId, payload, ip, userAgent }) {
  // The profile is loaded BEFORE validation, not after: the alternate contact
  // rules need to know the phone and email we already hold to reject an
  // "alternate" that is the same detail again. A session whose profile has gone
  // now fails as 401 before we bother judging the payload, which is the right
  // way round anyway.
  const profile = await LeadProfile.findByPk(leadProfileId);
  if (!profile) {
    throw new OnboardingError(ERROR_CODE.SESSION_INVALID, "Invalid session.", {
      status: 401,
    });
  }

  const result = validateProfilePayload(payload, {
    primaryPhone: profile.phone,
    primaryEmail: profile.email,
  });
  if (!result.ok) {
    throw new OnboardingError(
      ERROR_CODE.VALIDATION_FAILED,
      "Some answers need another look.",
      { status: 400, meta: { errors: result.errors } },
    );
  }

  const now = new Date();

  return sequelize.transaction(async (transaction) => {
    const existing = await LeadProfileDetails.findByPk(leadProfileId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    // Explicit allowlist — `result.value` only ever contains keys this
    // validator produced, so no client-supplied key can reach a column.
    const row = {
      ...result.value,
      lead_profile_id: leadProfileId,
      submitted_phone: profile.phone,
      submitted_ip: ip || null,
      submitted_user_agent: (userAgent || "").slice(0, 300) || null,
      last_submitted_at: now,
      first_submitted_at: existing?.first_submitted_at || now,
      submission_count: (existing?.submission_count || 0) + 1,
    };

    if (existing) {
      await existing.update(row, { transaction });
    } else {
      await LeadProfileDetails.create(row, { transaction });
    }

    // Activity.type is a validated enum on the model —
    // ['Note','Call','StatusChange','FollowUp','Assignment','System','Audit','Payment'].
    // 'System' with a null actor is the right shape: nobody on staff did this.
    await Activity.create(
      {
        profile_id: leadProfileId,
        actor_id: null,
        type: "System",
        title:
          row.submission_count === 1
            ? "Completed their onboarding profile"
            : "Updated their onboarding profile",
        details: `Submitted from the onboarding portal (submission #${row.submission_count}).`,
        metadata: { source: "onboarding_portal", ip: ip || null },
      },
      { transaction },
    );

    return { submissionCount: row.submission_count };
  });
}

module.exports = {
  OnboardingError,
  // Exported for scripts/check-phone.js only — nothing in the app calls it
  // directly, but it is the piece most worth being able to test without a
  // database, a WhatsApp bill or a foreign SIM.
  normalisePhoneInput,
  resolveProfileByPhone,
  getActiveEnrollments,
  startChallenge,
  verifyChallenge,
  resendChallenge,
  getDetails,
  submitDetails,
  isProfileComplete,
  completionPercent,
  maskPhone,
  maskEmail,
};
