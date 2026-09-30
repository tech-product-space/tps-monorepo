const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const reportController = require('../controllers/report.controller');
const { ROLES } = require('../config/constants/roles');

router.use(authenticate);

// Reports are a supervision tool for the sales line — Agents don't get access,
// and neither does the Program Manager, who sits outside that line.
const SUPERVISORY = [ROLES.MANAGER, ROLES.SUPERADMIN];

router.get('/status-report', requireRole(SUPERVISORY), reportController.getStatusReport);
router.get('/meetings', requireRole(SUPERVISORY), reportController.getMeetingsReport);
// Static path before any wildcard, and before '/meetings' can swallow it.
router.get('/meetings/calls', requireRole(SUPERVISORY), reportController.getMeetingsReportCalls);
// The cohort view the report page leads with. Kept alongside '/meetings'
// rather than replacing it — the two answer different questions, and the
// activity report is still what you want for per-week outcome rates.
router.get('/meetings/overview', requireRole(SUPERVISORY), reportController.getMeetingsOverview);
router.get('/meetings/overview/calls', requireRole(SUPERVISORY), reportController.getMeetingsOverviewCalls);

module.exports = router;
