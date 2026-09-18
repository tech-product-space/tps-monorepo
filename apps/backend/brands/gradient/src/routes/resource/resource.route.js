import express from "express";
import {
  createResource,
  getAllResources,
  updateResource,
  getResourceById,
  toggleResourceStatus,
  deleteResource,
  getAllPublishedResources,
  getResourceBySlug,
  checkSlugAvailability,
  updateEmailTemplate,
  getResourceDetailsBySlug
} from "../../controllers/resource/crud.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

import resourceLeadRoutes from "./resourceLead.routes.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

//Baser Url: /resources

router.use('/leads', resourceLeadRoutes);

router.post("/admin/create", adminAuth, createResource);
router.get("/admin/resources", adminAuth, getAllResources);
router.get("/admin/resources/:id", adminAuth, getResourceById);
router.put("/admin/resources/:id", adminAuth, updateResource);
router.patch("/admin/resources/:id/toggle-status", adminAuth, toggleResourceStatus);
router.delete("/admin/resources/:id", adminAuth, deleteResource);
router.get("/admin/slug-availability", adminAuth, checkSlugAvailability);

router.put("/:id/email-template", adminAuth, updateEmailTemplate);

router.get("/get-all-resources", getAllPublishedResources);
router.get("/slug/:slug", getResourceBySlug);
router.get("/slug/:slug/details", authMiddleware, getResourceDetailsBySlug);


export default router;
