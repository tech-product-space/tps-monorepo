import express from "express";

import {
    enrollFreeCourse,
    checkEnrollFreeCourse
} from "../../controllers/freeCourses/users.controller.js";

const router = express.Router();

router.post("/enroll", enrollFreeCourse);
router.get("/check-enrollment", checkEnrollFreeCourse);

export default router;