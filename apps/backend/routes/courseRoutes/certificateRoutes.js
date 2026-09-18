const express = require("express");
const router = express.Router();
const asyncWrapper = require("../../utils/asyncWrapper");

const templateController = require("../../controllers/courses/certificateTemplateController");
const certificateController = require("../../controllers/courses/courseCertificateController");

// BASE: /courses/:courseId/certificate

router.post(
  "/:courseId/certificate/template",
  asyncWrapper(templateController.saveCertificateTemplate),
);

router.get(
  "/:courseId/certificate/template",
  asyncWrapper(templateController.getCertificateTemplate),
);

router.post(
  "/:courseId/certificate/save-email-template",
  asyncWrapper(templateController.saveEmailTemplate),
);
router.get(
  "/:courseId/certificate/email-template",
  asyncWrapper(templateController.getEmailTemplateByCourseId),
);
router.post(
  "/:courseId/certificate/send-test-email",
  asyncWrapper(templateController.sendCertificateTestEmail),
);

router.post(
  "/:courseId/certificate/generate",
  asyncWrapper(certificateController.generateCourseCertificate),
);

router.get(
  "/:courseId/certificate/download-url",
  asyncWrapper(certificateController.getCertificateDownloadUrl),
);

router.get(
  "/certificate/my-certificates",
  asyncWrapper(certificateController.getUserCertificates),
);

module.exports = router;
