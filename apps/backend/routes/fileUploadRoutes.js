const express = require("express");
const router = express.Router();
const upload = require("../middlewares/multer");
const { uploadFile, uploadBlogsFile, getAllBlogFiles, deleteBlogFile, uploadResumeFile, getAllResumeFiles, uploadProjectFile,uploadJobApplicationResume,uploadScholarshipApplicationResume, deleteProjectFile, deleteResumeFile, uploadEventFile, deleteEventFile , uploadWrittenCourseFile , deleteWrittenCourseFile, getWrittenCourseVideoPresignedUrl, uploadAiProductFile, uploadRecordingFile, getLibraryFiles, deleteLibraryFile } = require("../controllers/fileUploadController");

router.post("/", upload.single("file"), uploadFile);

router.post("/ai-products", upload.single("file"), uploadAiProductFile);

router.post("/recordings", upload.single("file"), uploadRecordingFile);
router.get("/library", getLibraryFiles);
router.delete("/library", deleteLibraryFile);

router.post("/blogs", upload.single("file"), uploadBlogsFile);
router.get("/blogs", getAllBlogFiles);
router.delete("/blogs", deleteBlogFile);


router.post("/resume", upload.single("file"), uploadResumeFile);
router.get("/resume", getAllResumeFiles);
router.delete("/resume", deleteResumeFile);

router.post("/resume/job-application", upload.single("file"), uploadJobApplicationResume);
router.post("/resume/scholarship", upload.single("file"), uploadScholarshipApplicationResume);


router.post("/projects", upload.single("file"), uploadProjectFile);
router.delete("/projects", deleteProjectFile);

router.post("/events", upload.single("file"), uploadEventFile);
router.delete("/events", deleteEventFile);

router.post("/written-course", upload.single("file"), uploadWrittenCourseFile);
router.post("/written-course/presign-video", getWrittenCourseVideoPresignedUrl);
router.delete("/written-course", deleteWrittenCourseFile);

module.exports = router;