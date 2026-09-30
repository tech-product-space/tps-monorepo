const express = require('express');
const router = express.Router();
const {
  createJobApplication,
  checkIfApplied,
  getAdminJobs,
  getApplicationsByJobId
} = require('../controllers/jobApplicationsController');

router.post('/', createJobApplication);
router.get('/check', checkIfApplied);
router.get('/jobs-with-applications', getAdminJobs);
router.get('/job/:jobId/applications', getApplicationsByJobId);


module.exports = router;