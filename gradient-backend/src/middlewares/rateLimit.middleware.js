import rateLimit from "express-rate-limit";

/**
 * The app's only rate limiter.
 *
 * Note what is *not* here: nothing on the public feedback endpoints. Every
 * ceiling this file used to put on them was keyed by IP, and IP is the wrong
 * unit for that traffic — an event's attendees arrive in one twenty-minute
 * burst, usually sharing a single venue or campus network, so the limiter
 * counted a whole room as one person. See the notes at the bottom of this file
 * before adding one back.
 */

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again in a few minutes." },
};

/**
 * The public unsubscribe pair.
 *
 * Both take a signed token, so neither is guessable and the exposure is not
 * unauthorised suppression — it is someone hammering the endpoint with one
 * valid token they legitimately hold. Generous enough that a person retrying a
 * flaky connection, or revisiting the page to check it worked, never sees a
 * wall; the write is idempotent, so repeats are harmless anyway.
 *
 * This one survives because its traffic is the opposite shape: one person
 * acting alone on a link mailed to them, never a crowd on one network.
 */
export const unsubscribeLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
});

/**
 * Free course preview — both ends of the handshake.
 *
 * `POST /preview/verify` is the reason this exists. It is unauthenticated and
 * takes a token, which makes it the one guessable surface in the design: without
 * a ceiling, an attacker can grind launch tokens against it for as long as they
 * like. The mint endpoint sits behind `adminAuth` and needs no protection from
 * strangers, but sharing the limiter keeps one number to reason about.
 *
 * IP is the right unit here, unlike on the feedback routes below: this traffic
 * is one admin clicking a button, never a room full of people on one network.
 * Generous enough that nobody previewing a course in earnest will see it.
 */
export const previewLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 60,
});

/**
 * The two public writes on /projects: the download gate and "Submit Your
 * Project".
 *
 * Both create rows from unauthenticated requests, which is the whole reason
 * this exists — an open endpoint that writes is a spam target, and a
 * submissions queue full of junk is a queue nobody opens.
 *
 * Tighter than `previewLimiter` because the traffic profile is the opposite: an
 * admin previewing clicks a button repeatedly in one sitting, while a person
 * downloading a project does it once and a person contributing one does it
 * rarely. 20 an hour still leaves room for somebody working through a category
 * and grabbing several starters in an afternoon.
 *
 * IP is an imperfect unit — a college lab or an office NAT shares one — which
 * is why the ceiling is per hour rather than per minute, and why the gate
 * answers a repeat from a known address with a 200 rather than counting it as a
 * fresh write.
 */
export const submissionLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 20,
});

/**
 * ── Limiters that used to live here, and why they are gone ──────────────────
 *
 * All three guarded the single shareable feedback URL, which has no token and
 * no OTP — a deliberate trade for frictionlessness. They were removed because
 * they were turning real attendees away, not because the surfaces they covered
 * stopped mattering. What each one was for, and what still bounds it:
 *
 * `feedbackSubmitLimiter` — 10/hour on `POST /public/submit`. The write is
 * bounded where it should be: `submitFeedback` 409s a second submission from
 * the same guest and 409s again when a team-mate already sent one, so a repeat
 * cannot be stored however many times the endpoint is called.
 *
 * `feedbackLookupLimiter` — 20/10min on `POST /public/lookup`. This one covered
 * something real and now uncovered: the endpoint is an email-enumeration
 * oracle, answering "is this address on the guest list?" about a named person.
 * It writes nothing, so the exposure is disclosure, not damage.
 *
 * `feedbackRegisterLimiter` — 5/hour on `POST /public/register`. Also real and
 * now uncovered: this is the only unauthenticated endpoint that writes an
 * auto-approved guest row, so the public link can be used to add fake
 * attendees to an event — and, where certificates auto-issue, to have one
 * emailed to an arbitrary address. `event.canAcceptResponse` and the
 * `allowSelfRegistrationOnFeedback` setting are what bound it now: both are
 * per-event switches, so closing responses closes this off entirely.
 *
 * If either of the last two needs covering again, do not re-add an IP-keyed
 * limiter — key on `slug + email`, or set `app.set("trust proxy", …)` first so
 * the IP is at least the visitor's rather than the reverse proxy's.
 */

/**
 * There is no certificate limiter here any more.
 *
 * There was one, guarding a public lookup by certificate number — an
 * enumeration surface, because the numbers are short enough to read off a
 * printed page. That endpoint is gone: certificates are reachable only by the
 * signed-in person they belong to, so the session is the limit.
 */
