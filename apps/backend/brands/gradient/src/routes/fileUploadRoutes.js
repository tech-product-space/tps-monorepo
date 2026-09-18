import express from "express";
import upload from "../middlewares/uploadS3.js";

import { uploadFile, deleteFile , uploadResume } from "../controllers/fileUploadController.js";
import { uploadDialogImage, getDialogImages } from "../controllers/dialogFileUploadController.js";
import { adminAuth } from "../middlewares/adminAuth.middleware.js";
const router = express.Router();


// Admin-only, and only the admin panel calls them (via PrivateUploadAxios).
// Left open, an upload would log with no actor.
router.post("/admin/:type/upload", adminAuth, upload.single("file"), uploadFile)
router.delete("/admin/:type/delete-file", adminAuth, deleteFile)

// Public — the job application dialog on the website posts here.
router.post("/resume", upload.single("file"), uploadResume);

router.post("/media-assets/:type/upload", upload.single("file"), uploadDialogImage);
router.get("/media-assets/:type", adminAuth, getDialogImages);


export default router;