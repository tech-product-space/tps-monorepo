const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/email/emailTemplate.controller");
const { authenticate } = require("../middlewares/auth.middleware");

//BASE URL: /api/v1//email-templates

router.use(authenticate);

router.get("/variables", ctrl.getVariables);
router.get("/onboarding/courses", ctrl.getOnboardingCourses);
router.get("/", ctrl.getAll);
router.post("/", ctrl.create);
router.get("/:id", ctrl.getById);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);
router.post("/:id/activate", ctrl.activate);
router.post("/:id/deactivate", ctrl.deactivate);
router.post("/:id/send-preview", ctrl.sendPreview);

module.exports = router;