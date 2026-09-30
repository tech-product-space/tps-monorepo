const express = require('express');
const router = express.Router();

const aiProductController = require('../controllers/aiProductController');

// Public
router.get('/', aiProductController.getPublished);
router.get('/slug/:slug', aiProductController.getBySlug);
router.get('/preview/:id', aiProductController.getPreview); // token-protected

// Admin — static paths must come before /:id
router.get('/admin', aiProductController.getAllAdmin);
router.patch('/reorder', aiProductController.reorder);

router.post('/', aiProductController.create);
router.get('/:id/preview-token', aiProductController.getPreviewToken);
router.post('/:id/duplicate', aiProductController.duplicate);
router.get('/:id', aiProductController.getByIdAdmin);
router.patch('/:id', aiProductController.update);
router.delete('/:id', aiProductController.remove);

module.exports = router;
