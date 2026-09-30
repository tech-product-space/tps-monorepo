import { Op } from "sequelize";
import { LEAD_STATUS } from "../../config/constants/lead.js";
import db from "../../database/postgres/models/index.js";

const { Lead } = db;

/**
 * Single path into the `leads` table, shared by POST /leads and the course
 * endpoints, so dedupe and UTM capture behave identically no matter which form
 * the visitor filled in.
 *
 * A repeat email or phone is stored, not rejected — it is just flagged
 * DUPLICATE so sales can see the second touch without losing it.
 *
 * @returns {Promise<object>} the created Lead row
 */
export const createLeadRecord = async ({
  name,
  email,
  phone,
  countryCode,
  source,
  sourceDisplayName,
  subSource,
  subSourceDisplayName,
  pageUrl,
  referrer,
  utmId,
  utmSource,
  utmMedium,
  utmCampaign,
  utmTerm,
  utmContent,
  additionalData = {},
  courseId = null,
}) => {
  let status = LEAD_STATUS.NEW;

  const duplicateConditions = [];

  if (email) {
    duplicateConditions.push({ email });
  }

  if (phone) {
    duplicateConditions.push({
      phone,
      countryCode,
    });
  }

  if (duplicateConditions.length > 0) {
    const existingLead = await Lead.findOne({
      where: {
        [Op.or]: duplicateConditions,
      },
    });

    if (existingLead) {
      status = LEAD_STATUS.DUPLICATE;
    }
  }

  return Lead.create({
    name,
    email,
    phone,
    countryCode,
    source,
    sourceDisplayName,
    subSource,
    subSourceDisplayName,
    status,
    pageUrl,
    referrer,
    utmId,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    additionalData,
    courseId,
  });
};
