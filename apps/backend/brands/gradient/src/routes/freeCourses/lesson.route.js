import express from "express";

import {
  createLesson,
  importLessons,
  completeLesson,
  getLessonById,
  updateLesson,
  deleteLesson,
  reorderLessons,
  checkLessonSlugAvailability,
  updateLessonStatus, 
} from "../../controllers/freeCourses/lesson.controller.js";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

/**
 * ALL LESSON ROUTES ARE ADMIN PROTECTED
 */

router.post("/create/:moduleId", adminAuth, createLesson);
router.post("/import/:moduleId", adminAuth, importLessons);

router.get("/:id", adminAuth, getLessonById);

router.put("/reorder/:moduleId", adminAuth, reorderLessons);

router.put("/update/:id", adminAuth, updateLesson);

router.delete("/delete/:id", adminAuth, deleteLesson);

router.get("/check-slug/:moduleId",adminAuth,checkLessonSlugAvailability);

router.patch("/toggle-status/:id",adminAuth,updateLessonStatus);

router.post("/complete/:id", completeLesson);

export default router;