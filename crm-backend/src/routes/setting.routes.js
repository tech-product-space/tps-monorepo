const express = require('express');
const router = express.Router();
const settingController = require('../controllers/setting.controller');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const { ROLES } = require('../config/constants/roles');

// Business/invoice details are commercial config, so the Program Manager owns
// them alongside the Superadmin. Pipeline config (statuses, products) does not.
const BUSINESS_ADMINS = [ROLES.SUPERADMIN, ROLES.PROGRAM_MANAGER];

// All setting routes require authentication and Superadmin role
// All setting routes require authentication
router.use(authenticate);

// Status routes
router.get('/statuses', settingController.getStatuses);
router.post('/statuses', requireRole(['Superadmin']), settingController.createStatus);
router.put('/statuses/reorder', requireRole(['Superadmin']), settingController.reorderStatuses);
router.put('/statuses/:id', requireRole(['Superadmin']), settingController.updateStatus);

// Product routes
router.get('/products', settingController.getProducts);
router.put('/products/:productLabel/intent', requireRole(['Superadmin']), settingController.updateProductConfig);

// Business / Invoice settings (used on receipts, invoices, statements)
router.get('/business', settingController.getBusinessSettings);
router.put('/business', requireRole(BUSINESS_ADMINS), settingController.updateBusinessSettings);
router.post('/business/preview', requireRole(BUSINESS_ADMINS), settingController.previewBusinessDocument);

module.exports = router;
