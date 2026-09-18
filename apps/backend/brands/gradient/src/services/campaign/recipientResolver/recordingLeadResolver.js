import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import {
  compact,
  dateRangeClause,
  inClause,
  toRecipient,
} from "./helpers.js";

const { Recording, RecordingLead } = db;

/**
 * People who passed a session recording's email gate.
 *
 * The cleanest source in the system after resource leads, and cleaner in one
 * respect: `RecordingLeads` is unique on (recordingId, email), so unlike every
 * other source **one row here is one person**. The preview's "resolved" and
 * "unique" figures will agree for a single-recording audience, which they never
 * do for resource downloads.
 *
 * Filters reach through to `Recordings`, so an audience can be described by
 * what a recording *is* — "everyone who watched an SQL session" — rather than
 * by ticking individual recordings. That audience then picks up next month's
 * SQL recording without anyone re-editing the campaign.
 *
 * `name` is usually null: the gate asks for an address and nothing else. A
 * campaign body that greets by name has to tolerate that, here more than
 * anywhere else in this directory.
 */
export const resolveRecordingLeads = async (filters = {}) => {
  const where = compact({
    recordingId: inClause(filters.recordingId),
    createdAt: dateRangeClause(filters.createdFrom, filters.createdTo),
  });

  // Category only. `format` was here when recordings stored one; the kind of
  // session now lives on the linked event, and reaching two associations deep
  // for a filter no campaign screen exposes is cost without a caller.
  const recordingWhere = compact({
    categoryId: inClause(filters.categoryId),
  });

  const filteringByRecording = Object.keys(recordingWhere).length > 0;

  const rows = await RecordingLead.findAll({
    where,
    attributes: ["id", "name", "email"],
    include: [
      {
        model: Recording,
        as: "recording",
        attributes: [],
        // Only constrain the join when a recording-level filter was actually
        // given. Otherwise a lead would have to have a live recording to be
        // mailable, which is not what "everyone who watched anything" means.
        required: filteringByRecording,
        where: filteringByRecording ? recordingWhere : undefined,
      },
    ],
    raw: true,
  });

  return rows.map(toRecipient(CAMPAIGN_SOURCE_TYPE.RECORDING_LEADS));
};
