import db from "../../database/postgres/models/index.js";

const { RecordingLead, User } = db;

/**
 * What a signed-in visitor has already told us, wherever they told us it.
 *
 * The gate asks for ten fields. Asking again on every recording is the surest
 * way to lose somebody halfway through a library, so a person fills it once and
 * their answers are carried to the next recording they open. This resolves the
 * answers to carry.
 *
 * **Derived from `RecordingLeads`, not stored on the account.** A separate
 * profile table or a block of columns on `users` would be a second copy of
 * facts this table already holds, free to disagree with it the first time
 * either side was written without the other. The lead rows *are* the record of
 * what the person said; the newest confirmed one is their current answer.
 */

/**
 * The lead whose details should be carried, or null if there are none.
 *
 * Ordered by `detailsConfirmedAt`, not by `createdAt`, and the difference is
 * load-bearing. Somebody can confirm their details against a recording whose
 * row is two years old — an anonymous pass from before accounts were required,
 * updated in place — while a carried row from last month sits above it by
 * creation date. Ordering by creation would then pick the carried row and hand
 * back the details the confirmation had just replaced.
 *
 * @param {{ id: string, email: string }} user
 * @returns {Promise<object|null>}
 */
export const resolveWatchProfile = async (user) => {
  if (!user?.id) return null;

  const order = [
    // NULLS LAST because a row without one is the least useful answer, not the
    // most recent. Postgres sorts nulls first on DESC by default.
    [db.sequelize.literal(`"detailsConfirmedAt" DESC NULLS LAST`)],
    ["createdAt", "DESC"],
  ];

  const owned = await RecordingLead.findOne({ where: { userId: user.id }, order });

  if (owned) return owned;

  /**
   * Nothing under this account id — so look for the same address.
   *
   * Every row written before the gate required an account has `userId: null`,
   * and there are a lot of them. Without this fallback, every one of those
   * people would be asked to re-type details we already hold, on their first
   * visit after this shipped, which is the exact friction the carry exists to
   * remove.
   */
  if (!user.email) return null;

  const byEmail = await RecordingLead.findOne({
    where: { email: String(user.email).trim().toLowerCase(), userId: null },
    order,
  });

  if (!byEmail) return null;

  /**
   * Claim it, so the cheap lookup finds it next time.
   *
   * Silent on failure: a losing race with a concurrent write is not worth
   * failing a page load over, and the fallback above would simply run again.
   */
  try {
    await byEmail.update({ userId: user.id });
  } catch {
    // The profile is still correct; only the shortcut was missed.
  }

  return byEmail;
};

/**
 * The account, loaded for the fields the gate seeds its form from.
 *
 * `authMiddleware` puts only an id on `req.user`, and the gate needs a name, an
 * address and a phone to fill the form with. None of the three is authoritative
 * over what the person then types — `userId` is the only thing the session
 * fixes, and it is the only thing that has to be fixed.
 *
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export const loadGateUser = (userId) =>
  User.findByPk(userId, { attributes: ["id", "fullName", "email", "phone"] });

/**
 * What to put in the form before the person sees it.
 *
 * Every field is editable — the account supplies a starting point, not a
 * constraint. A name from Google sign-in is often a display name rather than
 * the one somebody wants on a lead, and a personal sign-up address is often not
 * the one they want a course team writing to.
 *
 * What the account *does* fix is identity: `userId` is written from the session
 * whatever they type here, so an edited address changes what we contact them on
 * and never who the row belongs to.
 *
 * The account is a fallback, not an override. Their own last answer wins for
 * every field, and the account fills the gaps — its phone is often blank
 * (Google sign-in never collects one) and its name is often a display name.
 *
 * @param {object} user
 * @param {object|null} profile
 */
export const buildGatePrefill = (user, profile) => ({
  name: profile?.name || user.fullName || "",
  /**
   * Their last answer first, the account second.
   *
   * Both fields are editable, so somebody may deliberately have given a work
   * address rather than the one they signed up with. Showing the account's
   * again would quietly undo that choice every time the form reappeared.
   */
  email: profile?.email || user.email,
  phone: profile?.phone || user.phone || "",
  countryCode: profile?.countryCode || "",
  attendeeType: profile?.attendeeType || "",
  // The form's field name, not the column's — this goes straight into it.
  role: profile?.jobTitle || "",
  collegeName: profile?.collegeName || "",
  graduationYear: profile?.graduationYear || "",
  linkedinUrl: profile?.linkedinUrl || "",
});

/**
 * The subset of a profile that a new recording's row copies.
 *
 * `additionalData` is deliberately absent. UTM and referrer describe *how
 * somebody arrived at a particular recording*; copying August's campaign
 * parameters onto a March visit would attribute the second one to a campaign
 * that had long since ended.
 *
 * `detailsConfirmedAt` is copied unchanged — it belongs to the details, not to
 * the row. That is what lets the freshness window actually expire.
 *
 * @param {object} profile
 */
export const carryProfileFields = (profile) => ({
  name: profile.name,
  // Carried like everything else: a person who gave a work address on their
  // first recording meant it for the next one too.
  email: profile.email,
  phone: profile.phone,
  countryCode: profile.countryCode,
  jobTitle: profile.jobTitle,
  attendeeType: profile.attendeeType,
  collegeName: profile.collegeName,
  graduationYear: profile.graduationYear,
  linkedinUrl: profile.linkedinUrl,
  detailsConfirmedAt: profile.detailsConfirmedAt,
});
