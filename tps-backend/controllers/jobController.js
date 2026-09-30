const axios = require("axios");
const { jobsBoard } = require("../models");
const { Op, literal } = require('sequelize');
const { getPaginationParams, getMeta } = require("../utils/pagination");
const { JOB_SOURCE, JOB_STATUS } = require("../constants/jobs");

function generateJobId() {
    const randomDigits = Math.floor(1000000 + Math.random() * 9000000); // 7 random digits
    return `tps${randomDigits}`;
}

const getAndStoreJobs = async (req, res) => {
    const { datasetId, jobType } = req.query;

    if (!datasetId) {
        return res.status(400).json({ error: "datasetId is required" });
    }

    try {
        const url = `https://api.apify.com/v2/datasets/${datasetId}/items?offset=0`;
        const response = await axios.get(url);
        const jobs = response.data;

        const deduplicatedJobs = Array.from(new Map(jobs.map(job => [job.id, job])).values());

        await jobsBoard.bulkCreate(
            deduplicatedJobs.map(job => ({
                ...job,
                postedAt: new Date(job.postedAt),
                uploadedBy: "apify",
                jobType: jobType || null, // <- Inject jobType from query
                status: JOB_STATUS.PUBLISHED, // new synced jobs are public; re-syncs keep their status (not in updateOnDuplicate)
            })),
            {
                updateOnDuplicate: [
                    "title", "location", "postedAt", "applyUrl", "link", "inputUrl",
                    "trackingId", "refId", "applicantsCount", "employmentType", "seniorityLevel",
                    "jobFunction", "industries", "salaryInfo", "benefits", "descriptionHtml",
                    "descriptionText", "companyName", "companyLogo", "companyDescription",
                    "companyWebsite", "companyEmployeesCount", "companyLinkedinUrl", "companyAddress",
                    "updatedAt", "uploadedBy", "jobType"
                ]
            }
        );

        res.status(200).json({
            message: "Jobs stored successfully",
            count: deduplicatedJobs.length,
            jobTypeApplied: jobType || "none"
        });
    } catch (error) {
        console.error("Error storing jobs:", error);
        res.status(500).json({
            error: "Failed to store jobs",
            details: error.message
        });
    }
};

const getAllJobs = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    // Callers that render the whole list in one go (the careers openings
    // section) pass an explicit limit; the paginated job board sends none and
    // keeps the 9-per-page default. Clamped because this route is public.
    const MAX_LIMIT = 50;
    const requestedLimit = parseInt(req.query.limit);
    const limit = Number.isNaN(requestedLimit)
        ? 9
        : Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
    const offset = (page - 1) * limit;

    const { employmentType, seniorityLevel, location, jobType, companyName, jobSource } = req.query;


    const where = {
        status: JOB_STATUS.PUBLISHED,
    };
    if (jobType == "Product") {
        where.title = { [Op.iLike]: `%Product%` };
    }

    if (employmentType) {
        where.employmentType = employmentType;
    }

    if (seniorityLevel) {
        where.seniorityLevel = seniorityLevel;
    }

    if (location) {
        where.location = { [Op.iLike]: `%${location}%` };
    }

    if (companyName) {
        where.companyName = { [Op.iLike]: `%${companyName}%` };
    }

    if (jobSource) {
        where.jobSource = jobSource;
    }

    if (jobType) {
        where.jobType = jobType; // exact match, assuming clean values like "Product" or "Engineering"
    }

    try {
        const { rows: jobs, count: totalJobs } = await jobsBoard.findAndCountAll({
            where,
            attributes: [
                'id',
                'companyName',
                'companyLogo',
                'applicantsCount',
                'employmentType',
                'seniorityLevel',
                'jobFunction',
                'industries',
                'title',
                'location',
                'postedAt',
                'applyUrl',
                'link',
                'uploadedBy',
                'jobType',
                'jobSource'
            ],
            order: [
                // Recency first so reposts (postedAt bumped to now) float to the
                // top regardless of source; admin-uploaded wins only as a
                // same-date tiebreaker.
                ['postedAt', 'DESC'],
                [literal(`CASE WHEN "uploadedBy" = 'admin' THEN 0 ELSE 1 END`), 'ASC']
            ],
            limit,
            offset
        });

        res.status(200).json({
            jobs,
            pagination: {
                totalJobs,
                currentPage: page,
                totalPages: Math.ceil(totalJobs / limit)
            }
        });
    } catch (error) {
        console.error("Error fetching jobs:", error);
        res.status(500).json({ error: "Failed to fetch jobs" });
    }
};


const getAllJobsLive = async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req.query, 20, 100);

        const { search, status, jobSource } = req.query;

        const whereClause = {};

        if (search && search.trim().length > 0) {
            whereClause.id = { [Op.iLike]: `%${search}%` };
        }

        if (status) {
            whereClause.status = status;
        }

        if (jobSource) {
            whereClause.jobSource = jobSource;
        }

        const { count, rows } = await jobsBoard.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [['postedAt', 'DESC']]
        });

        const meta = getMeta(count, page, limit);

        return res.status(200).json({
            success: true,
            meta,
            data: rows,
        });
    } catch (error) {
        console.error("Error fetching jobs:", error);
        res.status(500).json({ error: "Failed to fetch jobs" });
    }
};

const getJobById = async (req, res) => {
    const { id } = req.params;

    try {
        const job = await jobsBoard.findByPk(id);

        if (!job) {
            return res.status(404).json({ message: "Job not found" });
        }

        // Public callers (the careers site) pass ?public=true — hidden jobs
        // (draft/closed) should not be viewable there. Admin omits the flag and
        // can still load any job for editing.
        if (req.query.public === "true" && job.status !== JOB_STATUS.PUBLISHED) {
            return res.status(404).json({ message: "Job not found" });
        }

        res.status(200).json(job);
    } catch (error) {
        console.error("Error fetching job by ID:", error);
        res.status(500).json({ error: "Failed to fetch job" });
    }
};

const updateJobDetails = async (req, res) => {
    const { id } = req.params;
    const {
        jobType,
        title,
        location,
        descriptionHtml,
        employmentType,
        seniorityLevel,
        jobFunction,
        companyName,
        companyLogo,
        jobSource,
        status,
    } = req.body;

    if (!descriptionHtml || !title || !location || !employmentType || !seniorityLevel || !jobFunction || !companyName || !companyLogo || !jobType) {
        return res.status(400).json({ message: "All fields are required." });
    }

    if (jobSource && !Object.values(JOB_SOURCE).includes(jobSource)) {
        return res.status(400).json({ error: "Invalid 'jobSource'" });
    }

    if (status && !Object.values(JOB_STATUS).includes(status)) {
        return res.status(400).json({ error: "Invalid 'status'" });
    }

    try {
        const job = await jobsBoard.findByPk(id);

        if (!job) {
            return res.status(404).json({ message: "Job not found" });
        }

        // Update fields
        job.title = title;
        job.jobType = jobType;
        job.location = location;
        job.descriptionHtml = descriptionHtml;
        job.employmentType = employmentType;
        job.seniorityLevel = seniorityLevel;
        job.jobFunction = jobFunction;
        job.companyName = companyName;
        job.companyLogo = companyLogo;
        job.jobSource = jobSource;
        if (status) {
            job.status = status;
        }
        job.updatedAt = new Date();

        await job.save();

        res.status(200).json({
            message: "Job updated successfully",
            job: job
        });
    } catch (error) {
        console.error("Error updating job:", error);
        res.status(500).json({
            error: "Failed to update job",
            details: error.message
        });
    }
};


const deleteJob = async (req, res) => {
    const { id } = req.params;

    try {
        const job = await jobsBoard.findByPk(id);

        if (!job) {
            return res.status(404).json({ message: "Job not found" });
        }

        await job.destroy();

        res.status(200).json({ message: "Job deleted successfully" });
    } catch (error) {
        console.error("Error deleting job:", error);
        res.status(500).json({ error: "Failed to delete job", details: error.message });
    }
};

const createJob = async (req, res) => {
    const {
        jobType,
        title,
        location,
        descriptionHtml,
        employmentType,
        seniorityLevel,
        jobFunction,
        companyName,
        companyLogo,
        jobSource,
        status
    } = req.body;

    if (
        !jobType ||
        !title ||
        !location ||
        !descriptionHtml ||
        !employmentType ||
        !seniorityLevel ||
        !jobFunction ||
        !companyName ||
        !companyLogo
    ) {
        return res.status(400).json({ message: "All fields are required." });
    }

    if (jobSource && !Object.values(JOB_SOURCE).includes(jobSource)) {
        return res.status(400).json({ error: "Invalid 'jobSource'" });
    }

    if (status && !Object.values(JOB_STATUS).includes(status)) {
        return res.status(400).json({ error: "Invalid 'status'" });
    }

    try {
        const newJob = await jobsBoard.create({
            id: generateJobId(),
            title,
            jobType,
            location,
            descriptionHtml,
            employmentType,
            seniorityLevel,
            jobFunction,
            companyName,
            companyLogo: companyLogo,
            uploadedBy: "admin",
            postedAt: new Date(),
            jobSource,
            status: status || JOB_STATUS.PUBLISHED,
        });

        res.status(201).json({
            message: "Job created successfully",
            job: newJob
        });
    } catch (error) {
        console.error("Error creating job:", error);
        res.status(500).json({
            error: "Failed to create job",
            details: error.message
        });
    }
};

// Toggle a job's visibility / lifecycle state (show, hide, or close it).
const setJobStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !Object.values(JOB_STATUS).includes(status)) {
        return res.status(400).json({ error: "Invalid or missing 'status'" });
    }

    try {
        const job = await jobsBoard.findByPk(id);

        if (!job) {
            return res.status(404).json({ message: "Job not found" });
        }

        job.status = status;
        await job.save();

        res.status(200).json({ message: "Job status updated successfully", job });
    } catch (error) {
        console.error("Error updating job status:", error);
        res.status(500).json({ error: "Failed to update job status", details: error.message });
    }
};

// Repost a job: refresh its posted date so it surfaces back to the top of the
// public list (and resets "Posted X days ago"), re-publish it if it was hidden,
// and track how many times it has been reposted. Same record — applications stay
// attached to this job.
const repostJob = async (req, res) => {
    const { id } = req.params;

    try {
        const job = await jobsBoard.findByPk(id);

        if (!job) {
            return res.status(404).json({ message: "Job not found" });
        }

        const now = new Date();
        job.postedAt = now;
        job.repostedAt = now;
        job.repostCount = (job.repostCount || 0) + 1;
        job.status = JOB_STATUS.PUBLISHED;
        await job.save();

        res.status(200).json({ message: "Job reposted successfully", job });
    } catch (error) {
        console.error("Error reposting job:", error);
        res.status(500).json({ error: "Failed to repost job", details: error.message });
    }
};

module.exports = {
    getAndStoreJobs,
    getAllJobs,
    getJobById,
    updateJobDetails,
    deleteJob,
    getAllJobsLive,
    createJob,
    setJobStatus,
    repostJob
};