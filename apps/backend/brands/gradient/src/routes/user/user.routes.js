import express from "express";
import { getUserDetails } from "../../controllers/auth/user.controller.js";
import {
  downloadMyCertificateUnified,
  getMyCertificates,
  getMySummary,
} from "../../controllers/dashboard/mine.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

//BASE URL -> /user

router.get("/me", authMiddleware, getUserDetails);
router.get("/summary", authMiddleware, getMySummary);

// Every certificate this person holds, of either kind, and the bytes of one.
// `kind` is an explicit segment rather than probing both tables by number.
router.get("/certificates", authMiddleware, getMyCertificates);
router.get(
  "/certificates/:kind/:certificateNo/download",
  authMiddleware,
  downloadMyCertificateUnified,
);

export default router;