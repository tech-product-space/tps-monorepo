const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');

// Reads are now authenticated so results can be scoped to the caller's access.
router.get('/', authenticate, productController.getAllProducts);
router.post('/', authenticate, requireRole(['Superadmin']), productController.createProduct);

router.put('/sort-order', authenticate, requireRole(['Superadmin']), productController.updateProductSortOrder);

router.put('/:id', authenticate, requireRole(['Superadmin']), productController.updateProduct);
router.delete('/:id', authenticate, requireRole(['Superadmin']), productController.deleteProduct);
router.post('/:id/restore', authenticate, requireRole(['Superadmin']), productController.restoreProduct);

// Product access control
router.get('/:id/access', authenticate, requireRole(['Superadmin']), productController.getProductAccess);
router.put('/:id/access', authenticate, requireRole(['Superadmin']), productController.setProductAccess);

// Subsource routes (nested under product)
router.get('/:id/subsources', authenticate, productController.getSubsources);
router.post('/:id/subsources', authenticate, requireRole(['Superadmin']), productController.createSubsource);
router.put('/:id/subsources/:subsourceId', authenticate, requireRole(['Superadmin']), productController.updateSubsource);
router.delete('/:id/subsources/:subsourceId', authenticate, requireRole(['Superadmin']), productController.deleteSubsource);
router.post('/:id/subsources/:subsourceId/restore', authenticate, requireRole(['Superadmin']), productController.restoreSubsource);

// Subsource access control
router.get('/:id/subsources/:subsourceId/access', authenticate, requireRole(['Superadmin']), productController.getSubsourceAccess);
router.put('/:id/subsources/:subsourceId/access', authenticate, requireRole(['Superadmin']), productController.setSubsourceAccess);

module.exports = router;
