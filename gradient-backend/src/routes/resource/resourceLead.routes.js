import express from "express";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { createResourceLead, listResourceLeads } from "../../controllers/resource/lead.controller.js";

const router = express.Router();

//Baser Url: /resources/leads

router.get("/", adminAuth, listResourceLeads);
router.post("/", createResourceLead);

export default router;
