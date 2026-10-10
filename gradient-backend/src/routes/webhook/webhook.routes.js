import express from "express";
import { webhook } from "../../controllers/cal/cal.controller.js";

const router = express.Router();

// BASE URL -> /webhook
router.post("/cal", webhook);

export default router;
