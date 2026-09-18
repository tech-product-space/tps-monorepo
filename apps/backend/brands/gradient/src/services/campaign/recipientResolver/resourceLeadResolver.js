import { Op } from "sequelize";

import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import {
  compact,
  dateRangeClause,
  inClause,
  overlapClause,
  toRecipient,
} from "./helpers.js";

const { Resource, ResourceLead } = db;

/**
 * People who downloaded a resource. The cleanest source in the system:
 * `ResourceLead.email` is `allowNull: false` and guarded in the controller, so
 * unlike leads and event guests every row is mailable.
 *
 * It also carries `jobTitle`, which nothing else does.
 *
 * Filters reach through to `Resources`, so an audience can be described by what
 * a resource *is* rather than by ticking individual ones — a tag-based audience
 * picks up next month's resources without anyone re-editing the campaign.
 *
 * Note there is no dedupe at capture time: `createResourceLead` inserts
 * unconditionally, so one person downloading four things is four rows here.
 * buildRecipients dedupes for the send; the preview reports both numbers.
 */
export const resolveResourceLeads = async (filters = {}) => {
  const where = compact({
    resourceId: inClause(filters.resourceId),
    jobTitle: inClause(filters.jobTitle),
    createdAt: dateRangeClause(filters.createdFrom, filters.createdTo),
  });

  const resourceWhere = compact({
    resourceType: inClause(filters.resourceType),
    resourceCategory: inClause(filters.resourceCategory),
  });

  // A tag matches in either column. Nobody picking "ai" from a tag list means
  // "only where it happens to be the primary tag" — that distinction is an
  // authoring detail, not an audience one.
  const tagOverlap = overlapClause(filters.tags);

  if (tagOverlap) {
    resourceWhere[Op.or] = [
      { tagPrimary: tagOverlap },
      { tagSecondary: tagOverlap },
    ];
  }

  const filteringByResource =
    Object.keys(resourceWhere).length > 0 || Boolean(tagOverlap);

  const rows = await ResourceLead.findAll({
    where,
    attributes: ["id", "name", "email"],
    include: [
      {
        model: Resource,
        as: "resource",
        attributes: [],
        // Only constrain the join when a resource-level filter was actually
        // given; otherwise a lead pointing at a deleted resource would vanish
        // from an audience that never asked about resources at all.
        required: filteringByResource,
        where: filteringByResource ? resourceWhere : undefined,
      },
    ],
    raw: true,
  });

  return rows.map(toRecipient(CAMPAIGN_SOURCE_TYPE.RESOURCE_LEADS));
};
