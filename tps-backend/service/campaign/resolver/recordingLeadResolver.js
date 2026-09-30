const { Op } = require("sequelize");
const { RecordingLead, Recording } = require("../../../models");

/**
 * Everybody who passed the gate on the chosen recordings.
 *
 * The segment this exists to create is "people who watched an SQL session" —
 * which is why the filter accepts **categories** as well as a hand-picked list.
 * A category is how somebody thinks about the audience; naming eleven recordings
 * is how they would have to express it otherwise, and they would miss the one
 * published yesterday.
 *
 * No `DISTINCT` and no dedupe by email here: `RecordingLeads` holds one row per
 * (recording, email) by construction, unlike `ResourceLeads` where downloads and
 * people are genuinely different numbers. Somebody who watched three recordings
 * legitimately appears three times, and `buildRecipients` dedupes by email
 * across every source anyway.
 *
 * Filter shape:
 *   {
 *     recordingFilters: { [recordingId]: {} },   // hand-picked
 *     categoryIds: ["01H…"],                      // or a whole shelf
 *     signedUpAfter: "2026-01-01",
 *     signedUpBefore: "2026-06-30"
 *   }
 */
async function resolveRecordingLeads(filters) {
  if (!filters) return [];

  const recordingIds = Object.keys(filters.recordingFilters || {});
  const categoryIds = Array.isArray(filters.categoryIds)
    ? filters.categoryIds.filter(Boolean)
    : [];

  // Neither a list nor a category is not "everybody" — it is an unfinished
  // audience, and resolving it as the whole table is how a draft campaign
  // reaches every address in the system.
  if (!recordingIds.length && !categoryIds.length) return [];

  // Given both, they narrow rather than widen: the picked recordings *within*
  // those categories. Narrowing is the recoverable mistake — a send that reaches
  // too few people can be run again, and one that reached too many cannot be
  // taken back.
  const where = {};

  if (recordingIds.length) where.recordingId = { [Op.in]: recordingIds };

  if (filters.signedUpAfter || filters.signedUpBefore) {
    where.createdAt = {
      ...(filters.signedUpAfter && { [Op.gte]: new Date(filters.signedUpAfter) }),
      ...(filters.signedUpBefore && {
        [Op.lte]: new Date(filters.signedUpBefore),
      }),
    };
  }

  const leads = await RecordingLead.findAll({
    where,
    attributes: ["id", "name", "email", "phone", "jobTitle", "recordingId"],
    include: categoryIds.length
      ? [
          {
            model: Recording,
            as: "recording",
            attributes: [],
            required: true,
            where: { categoryId: { [Op.in]: categoryIds } },
          },
        ]
      : [],
    raw: true,
  });

  return leads.map((lead) => ({
    email: lead.email,
    name: lead.name,
    phone: lead.phone,
    source_type: "recordings",
    source_id: lead.id,
  }));
}

module.exports = { resolveRecordingLeads };
