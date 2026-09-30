const db = require("../../models");

const { RecordingLead, users } = db;

/**
 * What a signed-in visitor has already told us, wherever they told us it.
 *
 * The gate asks for nine fields. Asking again on every recording is the surest
 * way to lose somebody halfway through a library, so a person fills it once and
 * their answers are carried to the next recording they open. This resolves the
 * answers to carry.
 *
 * **Derived from `RecordingLeads`, not stored on the account.** A separate
 * profile table, or a block of columns on `users`, would be a second copy of
 * facts this table already holds — free to disagree with it the first time
 * either side was written without the other. The lead rows *are* the record of
 * what the person said; the newest confirmed one is their current answer.
 */

/**
 * The lead whose details should be carried, or null if there are none.
 *
 * Ordered by `detailsConfirmedAt`, not `createdAt`, and the difference is
 * load-bearing. Somebody can confirm their details against a recording whose
 * row is old — a pass from before accounts were required, updated in place —
 * while a carried row from last month sits above it by creation date. Ordering
 * by creation would then pick the carried row and hand back the details the
 * confirmation had just replaced.
 */
const resolveWatchProfile = async (user) => {
  if (!user?.id) return null;

  const order = [
    // NULLS LAST because a row without one is the least useful answer, not the
    // most recent. Postgres sorts nulls first on DESC by default.
    [db.Sequelize.literal(`"detailsConfirmedAt" DESC NULLS LAST`)],
    ["createdAt", "DESC"],
  ];

  const owned = await RecordingLead.findOne({
    where: { userId: user.id },
    order,
  });

  if (owned) return owned;

  /**
   * Nothing under this account id — so look for the same address.
   *
   * Every row written before the gate required an account has `userId: null`.
   * Without this fallback, every one of those people would be asked to re-type
   * details we already hold, on their first visit after this ships, which is
   * the exact friction the carry exists to remove.
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
   * Silent on failure: losing a race with a concurrent write is not worth
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
 * `requireUser` already attaches the whole row as `req.appUser`, so this exists
 * for the narrow read — and so a caller that only has an id can get the same
 * three fields. None of them is authoritative over what the person then types:
 * `userId` is the only thing the session fixes, and the only thing that has to
 * be.
 */
const loadGateUser = (userId) =>
  users.findByPk(userId, { attributes: ["id", "name", "email", "phone"] });

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
 * Their own last answer wins for every field and the account fills the gaps —
 * its phone is often blank (Google sign-in never collects one) and its name is
 * often a display name. Showing the account's address over one they
 * deliberately changed would quietly undo that choice every time the form
 * reappeared.
 */
const buildGatePrefill = (user, profile) => ({
  name: profile?.name || user?.name || "",
  email: profile?.email || user?.email || "",
  phone: profile?.phone || user?.phone || "",
  countryCode: profile?.countryCode || "",
  attendeeType: profile?.attendeeType || "",
  // The form calls this "role"; the column is `jobTitle`. Emitted under the
  // form's name because this object seeds the form.
  role: profile?.jobTitle || "",
  collegeName: profile?.collegeName || "",
  graduationYear: profile?.graduationYear || "",
  linkedinUrl: profile?.linkedinUrl || "",
});

/**
 * The fields a carry copies onto a new recording's row.
 *
 * `detailsConfirmedAt` travels **unchanged**: these answers were typed then,
 * not now, and resetting it here would let somebody keep a profile alive
 * forever by watching one more recording every twenty-nine days.
 */
const carryProfileFields = (profile) => ({
  name: profile.name,
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

module.exports = {
  resolveWatchProfile,
  loadGateUser,
  buildGatePrefill,
  carryProfileFields,
};
