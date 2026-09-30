import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import { compact, dateRangeClause, inClause, toRecipient } from "./helpers.js";

const { Project, ProjectLead } = db;

/**
 * People who passed a project's download gate.
 *
 * Like `ResourceLeads`, every row is mailable: `email` is `allowNull: false`
 * and normalised in the controller. Unlike it, this table dedupes at capture
 * time — one row per (project, person), enforced by a unique index — so one
 * person who downloaded four projects is four rows here, but one person who
 * downloaded the *same* project on four devices is one.
 *
 * Filters reach through to `Projects`, so an audience can be described by what
 * a project *is* — everyone who downloaded a Python project, everyone who took
 * an advanced one — rather than by ticking individual projects. A category
 * audience then picks up next month's projects without anyone re-editing the
 * campaign.
 */
export const resolveProjectLeads = async (filters = {}) => {
  const where = compact({
    projectId: inClause(filters.projectId),
    createdAt: dateRangeClause(filters.createdFrom, filters.createdTo),
  });

  const projectWhere = compact({
    categoryId: inClause(filters.categoryId),
    level: inClause(filters.level),
  });

  const filteringByProject = Object.keys(projectWhere).length > 0;

  const rows = await ProjectLead.findAll({
    where,
    attributes: ["id", "name", "email"],
    include: [
      {
        model: Project,
        as: "project",
        attributes: [],
        // Only constrain the join when a project-level filter was actually
        // given; otherwise a lead pointing at a deleted project would vanish
        // from an audience that never asked about projects at all.
        required: filteringByProject,
        where: filteringByProject ? projectWhere : undefined,
      },
    ],
    raw: true,
  });

  return rows.map(toRecipient(CAMPAIGN_SOURCE_TYPE.PROJECT_LEADS));
};
