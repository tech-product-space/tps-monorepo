const express = require("express");
const router = express.Router();
const programOfferController = require("../controllers/programOfferController");

// get all program offers
router.get('/all', programOfferController.getAllProgramOffers);

// get or post
router.post("/", programOfferController.upsertProgramOffer);
router.get("/:program_name", programOfferController.getProgramOffer);

// 🔹 New APIs for enrollmentEmail
router.post("/:program_name/email", programOfferController.upsertEnrollmentEmail);
router.get("/:program_name/email", programOfferController.getEnrollmentEmail);

// 🔹 New APIs for downloadCurriculum
router.post("/:program_name/curriculum", programOfferController.upsertDownloadCurriculum);
router.get("/:program_name/curriculum", programOfferController.getDownloadCurriculum);

// Send curriculum email on download
router.post("/:program_name/send-curriculum-email", programOfferController.sendCurriculumEmail);

module.exports = router;