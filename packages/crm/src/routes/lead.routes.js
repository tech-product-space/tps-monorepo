const express = require('express');
const router = express.Router();
const leadController = require('../controllers/lead.controller');
const websiteActivityController = require('../controllers/leadWebsiteActivity.controller');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');

const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const importController = require('../controllers/lead.import.controller');
const exportController = require('../controllers/lead.export.controller');
const { ROLES, ALL_ROLES, canBulkEditLeads } = require('../config/constants/roles');

//public
router.post('/external', leadController.createExternalLead);
router.post('/external/verify', leadController.verifyExternalLead);

// All endpoints require authentication
router.use(authenticate);

// ⚠️ IMPORTANT: /import must come BEFORE /:id wildcard routes,
// otherwise Express treats "import" as an :id param value.
router.post('/import', requireRole(['Superadmin', 'Manager']), upload.single('csvFile'), importController.importCsv);
router.get('/export', requireRole([ROLES.SUPERADMIN]), exportController.exportLeads);

// List
router.get('/', leadController.getLeads);

router.get('/followups', leadController.getFollowups)
router.get('/followup-counts', leadController.getFollowUpCounts)

// Create (runs through dedup service)
router.post('/', leadController.createLead);

// Bulk operations. Every other lead write is open to all roles; this one is
// not, so the exclusion is stated here as well as in the read-only middleware's
// allowlist, where it is otherwise only an absence.
router.put(
  '/bulk',
  requireRole(ALL_ROLES.filter(canBulkEditLeads)),
  leadController.bulkUpdateLeads,
);

// Re-entry report (supervisory roles only) — must be before /:id wildcard
router.get(
  '/reports/reentry',
  requireRole([ROLES.SUPERADMIN, ROLES.MANAGER, ROLES.PROGRAM_MANAGER]),
  leadController.getReentryReport,
);

// Note edit/delete by noteId — must be before /:id wildcard
router.put('/notes/:noteId', leadController.updateNote);
router.delete('/notes/:noteId', leadController.deleteNote);

router.get('/metrics', leadController.getLeadMetrics);

// Single lead operations (wildcard :id must come last)
router.get('/:id', leadController.getLeadById);
router.get('/:id/activities', leadController.getLeadActivities);
router.put('/:id', leadController.updateLead);
router.delete('/:id', requireRole(['Superadmin']), leadController.deleteLead);

// Notes routes (replaces conversation)
router.get('/:id/notes', leadController.getNotes);
router.get('/:id/profile-notes', leadController.getProfileNotes);

// A person's browsing trail. Keyed off the lead only as a way in — what comes
// back belongs to the person behind it, so it is the same on every product tab.
router.get('/:id/website-activity', websiteActivityController.getWebsiteActivity);
router.post('/:id/notes', leadController.addNote);


module.exports = router;
