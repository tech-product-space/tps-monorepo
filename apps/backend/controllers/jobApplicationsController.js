const { JobApplication, jobsBoard } = require('../models');
const { getPaginationParams, getMeta } = require("../utils/pagination")

exports.createJobApplication = async (req, res) => {
    const {
        userId,
        name,
        email,
        resume,
        phoneNumber,
        linkedinProfile,
        portfolioLink,
        role,
        jobId,
        yearsOfExperience,
        currentCTC,
        expectedCTC,
        noticePeriod,
        openToRelocate
    } = req.body;

    try {
        // Only published jobs accept applications — closed/draft jobs are not
        // open even if someone reaches them via a direct link.
        const job = await jobsBoard.findByPk(jobId);
        if (!job) {
            return res.status(404).json({ message: "Job not found" });
        }
        if (job.status !== "published") {
            return res.status(409).json({ message: "This job is no longer accepting applications." });
        }

        // Check if user already applied to this job
        const existing = await JobApplication.findOne({
            where: { userId, jobId }
        });

        if (existing) {
            return res.status(200).json({ appliedBefore: true });
        }

        // Create new application
        const newApplication = await JobApplication.create({
            userId,
            name,
            email,
            resume,
            phoneNumber,
            linkedinProfile,
            portfolioLink,
            role,
            jobId,
            yearsOfExperience,
            currentCTC,
            expectedCTC,
            noticePeriod,
            openToRelocate
        });

        return res.status(201).json({ appliedBefore: false, application: newApplication });
    } catch (error) {
        console.error('Error creating application:', error);
        return res.status(500).json({ message: 'Server error', error });
    }
};

exports.checkIfApplied = async (req, res) => {
    const { userId, jobId } = req.query;

    if (!userId || !jobId) {
        return res.status(400).json({ message: 'userId and jobId are required' });
    }

    try {
        const existing = await JobApplication.findOne({
            where: { userId, jobId }
        });

        return res.status(200).json({ appliedBefore: !!existing });
    } catch (error) {
        console.error('Error checking application:', error);
        return res.status(500).json({ message: 'Server error', error });
    }
};

exports.getAdminJobs = async (req, res) => {
    try {
        const jobs = await jobsBoard.findAll({
            where: {
                uploadedBy: 'admin'
            },
            attributes: {
                exclude: ['descriptionHtml']
            },
            order: [['createdAt', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            data: jobs
        });

    } catch (error) {
        console.error('Error fetching admin jobs:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

exports.getApplicationsByJobId = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { page, limit, offset } = getPaginationParams(req.query);

    const { count, rows } = await JobApplication.findAndCountAll({
      where: { jobId },
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const meta = getMeta(count, page, limit);

    return res.status(200).json({
      success: true,
      meta,
      data: rows
    });

  } catch (error) {
    console.error('Error fetching applications by job:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch applications',
      details: error.message
    });
  }
};