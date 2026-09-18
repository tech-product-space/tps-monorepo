const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const boardController = require('../controllers/board.controller');
const { ROLES } = require('../config/constants/roles');

router.use(authenticate);

// Boards are a supervision surface, like Reports — the sales line and the
// people who run it. Agents and the Program Manager sit outside it.
const SUPERVISORY = [ROLES.MANAGER, ROLES.SUPERADMIN];

router.get(
  '/lead-acquisition',
  requireRole(SUPERVISORY),
  boardController.getLeadAcquisitionBoard,
);

router.get(
  '/lead-status',
  requireRole(SUPERVISORY),
  boardController.getLeadStatusBoard,
);

module.exports = router;
