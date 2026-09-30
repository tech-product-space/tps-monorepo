const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const { ROLES, ALL_ROLES } = require('../config/constants/roles');

// All user routes require authentication
router.use(authenticate);

// Managers and Superadmins can get their team
router.get('/my-team', requireRole(ALL_ROLES), userController.getMyTeam);

// Attendee candidates for scheduling a Google Meet (role-filtered)
router.get('/meeting-attendees', requireRole(ALL_ROLES), userController.getMeetingAttendees);

// User administration. Superadmins act org-wide; Managers are narrowed to their
// own direct reports inside each controller (see denyReason in user.controller).
// Program Managers are admitted for the directory read only — every write below
// is refused by denyReason and by the read-only middleware.
router.use(requireRole([ROLES.SUPERADMIN, ROLES.MANAGER, ROLES.PROGRAM_MANAGER]));

router.get('/', userController.getAllUsers);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.patch('/:id/deactivate', userController.deactivateUser);
router.patch('/:id/reactivate', userController.reactivateUser);
router.patch('/:id/reset-password', userController.resetPassword);

module.exports = router;
