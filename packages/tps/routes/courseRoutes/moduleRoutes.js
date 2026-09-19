const express = require('express');
const router = express.Router();
const asyncWrapper = require('../../utils/asyncWrapper');
const modulesController = require('../../controllers/courses/moduleController');

// BASE_URL: /courses/modules

router.post("/:courseId/import", asyncWrapper(modulesController.importModules));
router.post("/:courseId", asyncWrapper(modulesController.create));   // Slug is requied , status has been added  ,
router.put("/:id", asyncWrapper(modulesController.update));
router.delete("/:id", asyncWrapper(modulesController.delete));
router.get("/:courseId", asyncWrapper(modulesController.getByCourseId));
router.put("/:courseId/reorder", modulesController.reorder);

router.get("/:courseId/check-slug", asyncWrapper(modulesController.checkSlugAvailability));
router.put("/:id/status", asyncWrapper(modulesController.updateModuleStatus));

module.exports = router;