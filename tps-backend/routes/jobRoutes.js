const express = require("express");
const router = express.Router();
const { getAndStoreJobs, getAllJobs, getJobById, updateJobDetails, deleteJob, getAllJobsLive, createJob, setJobStatus, repostJob } = require("../controllers/jobController");

router.post('/create', createJob);
router.get("/sync", getAndStoreJobs);
router.get("/jobs", getAllJobs);
router.get("/", getAllJobsLive);
router.get("/:id", getJobById);
router.put('/:id/update', updateJobDetails);
router.patch('/:id/status', setJobStatus);
router.post('/:id/repost', repostJob);
router.delete('/:id', deleteJob);

module.exports = router;