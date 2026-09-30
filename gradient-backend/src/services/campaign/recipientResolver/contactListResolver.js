import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import { compact, inClause, toRecipient } from "./helpers.js";

const { Contact } = db;

/**
 * People on an uploaded contact list.
 *
 * The only source not derived from something the product recorded, which makes
 * it the one an admin reaches for when the audience exists nowhere else — a
 * partner's list, a conference export, a spreadsheet.
 *
 * No list means nobody, following `campaignRecipients`: resolving to *every*
 * contact would mail every list ever uploaded on the include side, and empty
 * the audience on the exclude side. Neither is a plausible thing to have meant.
 */
export const resolveContactLists = async (filters = {}) => {
  const contactListId = inClause(filters.contactListId);

  if (!contactListId) return [];

  const where = compact({ contactListId });

  const rows = await Contact.findAll({
    where,
    attributes: ["id", "name", "email"],
    raw: true,
  });

  return rows.map(toRecipient(CAMPAIGN_SOURCE_TYPE.CONTACT_LISTS));
};
