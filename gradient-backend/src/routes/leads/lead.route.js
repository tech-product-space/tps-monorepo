import express from "express";
import { createLead, listLeads, listLeadSources , checkHasApplied , getLeadDetailsByJobId , getExternalJobApplications} from "../../controllers/lead/crud.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

//BASE URL -> /leads

router.post("/", createLead);
router.get("/", adminAuth, listLeads);
router.get("/sources", adminAuth, listLeadSources);

router.get("/check-applied", checkHasApplied);

// The below 2 api will be used in job page
router.get("/job/external",getExternalJobApplications);
router.get("/job/:jobId", getLeadDetailsByJobId);

export default router;