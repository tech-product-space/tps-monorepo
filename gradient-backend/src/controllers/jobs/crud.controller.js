import db from "../../database/postgres/models/index.js";
const { jobsBoard } = db;

import axios from "axios";
import { Op, literal } from "sequelize";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";

const JOB_SOURCE = {
  EXTERNAL: "EXTERNAL",
  INTERNAL: "INTERNAL",
};

const generateJobId = () => {
  const randomDigits = Math.floor(1000000 + Math.random() * 9000000);
  return `gl${randomDigits}`;
};

/**
 * STORE JOBS FROM APIFY
 */
export const getAndStoreJobs = asyncWrapper(async (req, res) => {
  const { datasetId, jobType } = req.query;

  if (!datasetId) {
    return res.status(400).json({
      success: false,
      message: "datasetId is required",
    });
  }

  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?offset=0`;
  const response = await axios.get(url);

  const jobs = response.data;

  const deduplicatedJobs = Array.from(
    new Map(jobs.map((job) => [job.id, job])).values()
  );

  await jobsBoard.bulkCreate(
    deduplicatedJobs.map((job) => ({
      ...job,
      postedAt: new Date(job.postedAt),
      uploadedBy: "apify",
      jobType: jobType || null,
      applyUrl: job.applyUrl || job.link || null,
    })),
    {
      updateOnDuplicate: [
        "title",
        "location",
        "postedAt",
        "applyUrl",
        "link",
        "inputUrl",
        "trackingId",
        "refId",
        "applicantsCount",
        "employmentType",
        "seniorityLevel",
        "jobFunction",
        "industries",
        "salaryInfo",
        "benefits",
        "descriptionHtml",
        "descriptionText",
        "companyName",
        "companyLogo",
        "companyDescription",
        "companyWebsite",
        "companyEmployeesCount",
        "companyLinkedinUrl",
        "companyAddress",
        "updatedAt",
        "uploadedBy",
        "jobType",
      ],
    }
  );

  return res.status(200).json({
    success: true,
    message: "Jobs stored successfully",
    count: deduplicatedJobs.length,
  });
});

/**
 * GET ALL JOBS (FILTERED)
 */
export const getAllJobs = asyncWrapper(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const offset = (page - 1) * limit;

  const { search } = req.query;

  // ✅ Simple where clause
  const where = {
    jobType: { [Op.ne]: "draft" },

    [Op.not]: {
      [Op.and]: [
        { jobSource: "EXTERNAL" },
        { applyUrl: { [Op.or]: [null, ""] } },
      ],
    },
  };

  // ✅ If search provided → filter by id
  if (search) {
    where.id = { [Op.iLike]: `%${search}%` };
  }

  const { rows, count } = await jobsBoard.findAndCountAll({
    where,
    attributes: [
      "id",
      "companyName",
      "companyLogo",
      "applicantsCount",
      "employmentType",
      "seniorityLevel",
      "jobFunction",
      "industries",
      "title",
      "location",
      "postedAt",
      "applyUrl",
      "link",
      "jobType",
      "jobSource",
    ],
    order: [
      [literal(`CASE WHEN "uploadedBy" = 'admin' THEN 0 ELSE 1 END`), "ASC"],
      ["postedAt", "DESC"],
    ],
    limit,
    offset,
  });

  const totalPages = Math.ceil(count / limit);

  const meta = {
    total: count,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };

  return res.status(200).json({
    success: true,
    data: rows,
    meta,
  });
});

/**
 * GET ALL INTERNAL JOBS 
 */
export const getAllInternalJobs = asyncWrapper(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const offset = (page - 1) * limit;

  const where = {
    [Op.or]: [
      { jobSource: "INTERNAL" },
      { jobType: "draft" },
    ],
  };

  const { rows, count } = await jobsBoard.findAndCountAll({
    where,
    attributes: [
      "id",
      "companyName",
      "companyLogo",
      "applicantsCount",
      "employmentType",
      "seniorityLevel",
      "jobFunction",
      "industries",
      "title",
      "location",
      "postedAt",
      "applyUrl",
      "link",
      "jobType",
      "jobSource",
    ],
    order: [
      [literal(`CASE WHEN "uploadedBy" = 'admin' THEN 0 ELSE 1 END`), "ASC"],
      ["postedAt", "DESC"],
    ],
    limit,
    offset,
  });

  const totalPages = Math.ceil(count / limit);

  const meta = {
    total: count,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };

  return res.status(200).json({
    success: true,
    data: rows,
    meta,
  });
});

/**
 * GET JOB BY ID
 */
export const getJobById = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const job = await jobsBoard.findByPk(id, {
    attributes: {
      exclude: ["uploadedBy", "createdAt", "updatedAt"],
    },
  });

  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Job not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: job,
  });
});

/**
 * CREATE JOB (ADMIN)
 */
export const createJob = asyncWrapper(async (req, res) => {
  const {
    jobType,   // backend-engineering
    title,
    location,
    descriptionHtml,
    employmentType, // Full-time , Contract , Volunteer
    seniorityLevel,
    companyName,
    companyLogo,
    companyDescription,
    companyWebsite,
  } = req.body;

  if (
    !jobType ||
    !title ||
    !location ||
    !descriptionHtml ||
    !seniorityLevel ||
    !employmentType ||
    !companyName ||
    !companyLogo ||
    !companyDescription
  ) {
    return res.status(400).json({
      success: false,
      message: "All fields are required",
    });
  }

  const job = await jobsBoard.create({
    id: generateJobId(),
    jobType,
    title,
    location,
    descriptionHtml,
    seniorityLevel,
    employmentType,
    companyName,
    companyLogo,
    companyDescription,
    companyWebsite,
    uploadedBy: "admin",
    postedAt: new Date(),
    jobSource: "INTERNAL",
  });

  return res.status(201).json({
    success: true,
    data: job,
  });
});

/**
 * UPDATE JOB
 */
export const updateJob = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const job = await jobsBoard.findByPk(id);

  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Job not found",
    });
  }

  await job.update(req.body);

  return res.status(200).json({
    success: true,
    data: job,
  });
});

/**
 * DELETE JOB
 */
export const deleteJob = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const job = await jobsBoard.findByPk(id);

  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Job not found",
    });
  }

  // Captured before the row goes — the log's automatic label lookup cannot help
  // once the record is deleted.
  req.activity?.set({ entityLabel: job.title });

  await job.destroy();

  return res.status(200).json({
    success: true,
    message: "Job deleted successfully",
  });
});