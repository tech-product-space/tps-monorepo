import express from "express";
import {
  createJob,
  getAllJobs,
  getAllInternalJobs,
  getJobById,
  updateJob,
  deleteJob,
  getAndStoreJobs,
} from "../../controllers/jobs/crud.controller.js";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

/**
 * ADMIN ROUTES
 */
router.post("/admin/create", adminAuth, createJob);
router.get("/admin/jobs", adminAuth, getAllJobs);
router.get("/admin/internal-jobs", adminAuth, getAllInternalJobs);
router.put("/admin/jobs/:id", adminAuth, updateJob);
router.delete("/admin/jobs/:id", adminAuth, deleteJob);

/**
 * INGESTION ROUTE (APIFY)
 */
router.get("/fetch-jobs", getAndStoreJobs);

/**
 * PUBLIC ROUTES
 */
router.get("/get-all-jobs", getAllJobs);
router.get("/:id", getJobById);



export default router;