import { Op } from "sequelize";
import db from "../../database/postgres/models/index.js";
const { Lead } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import { createLeadRecord } from "../../services/lead/createLead.service.js";

export const createLead = asyncWrapper(async (req, res) => {
  const { name, source } = req.body;

  if (!name || !source) {
    return res.status(400).json({
      message: "name and source are required",
    });
  }

  // Dedupe and persistence live in the service so the course enrollment and
  // brochure endpoints record leads exactly the same way this route does.
  // courseId is dropped here: it is a foreign key the course endpoints set
  // themselves, and an unknown id posted to this open route would only fail.
  const { courseId, ...leadPayload } = req.body;

  await createLeadRecord(leadPayload);

  res.status(201).json({
    message: "Lead stored successfully",
  });
});

export const listLeads = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { status, source, subSource, search } = req.query;

  const where = {};

  if (status) where.status = status;
  if (source) where.source = source;
  if (subSource) where.subSource = subSource;

  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
      { phone: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Lead.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  const meta = getMeta(count, page, limit);

  res.json({
    data: rows,
    meta,
  });
});

export const listLeadSources = asyncWrapper(async (req, res) => {
  const sources = await db.sequelize.query(
    `
    SELECT
      source,
      MAX("sourceDisplayName") as "sourceDisplayName",
      json_agg(
        DISTINCT jsonb_build_object(
          'subSource', "subSource",
          'subSourceDisplayName', "subSourceDisplayName"
        )
      ) FILTER (WHERE "subSource" IS NOT NULL) as "subSources"
    FROM leads
    GROUP BY source
    ORDER BY source;
    `,
    {
      type: db.sequelize.QueryTypes.SELECT,
    },
  );

  res.json({
    data: sources,
  });
});

export const checkHasApplied = asyncWrapper(async (req, res) => {
  const { jobId, userId } = req.query;

  if (!jobId) {
    return res.status(400).json({
      message: "jobId is required",
    });
  }

  const finalUserId = userId || req.user?.id;

  if (!finalUserId) {
    return res.status(400).json({
      message: "userId is required",
    });
  }

  const existingApplication = await Lead.findOne({
    where: {
      source: "job",
      subSource: {
        [Op.in]: ["INTERNAL", "EXTERNAL"],
      },
      additionalData: {
        jobId,
        userId: finalUserId,
      },
    },
    attributes: ["id"],
  });

  return res.json({
    hasApplied: !!existingApplication,
  });
});


export const getLeadDetailsByJobId = asyncWrapper(async (req, res) => {
  const { jobId } = req.params;

  if (!jobId) {
    return res.status(400).json({
      message: "jobId is required",
    });
  }

  const lead = await Lead.findAll({
    where: {
      source: "job",
      additionalData: {
        jobId,
      },
    },
    order: [["createdAt", "DESC"]],
  });

  if (!lead) {
    return res.status(404).json({
      message: "Lead not found",
    });
  }

  return res.json({
    data: lead,
  });
});



export const getExternalJobApplications = asyncWrapper(async (req, res) => {

  const leads = await Lead.findAll({
    where: {
      source: "job",
      subSource: "EXTERNAL",
    },
    order: [["createdAt", "DESC"]],
  });

  return res.json({
    data: leads,
  });
});