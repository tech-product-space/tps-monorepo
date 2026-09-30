import express from "express";
import { createBlog, getAllBlogs, updateBlog, getBlogById, toggleBlogStatus, deleteBlog, getAllPublishedBlogs,getAllRecommendedBlogs,getFeaturedBlogs, getBlogByUrl, checkSlugAvailability } from "../../controllers/blog/crud.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

router.post("/admin/create", adminAuth, createBlog);
router.get("/admin/blogs", adminAuth, getAllBlogs);
router.get("/admin/blogs/:id", adminAuth, getBlogById);
router.put("/admin/blogs/:id", adminAuth, updateBlog);
router.patch("/admin/blogs/:id/toggle-status", adminAuth, toggleBlogStatus);
router.delete("/admin/blogs/:id", adminAuth, deleteBlog);
router.get("/admin/slug-availability", adminAuth, checkSlugAvailability);

router.get("/get-all-blogs", getAllPublishedBlogs);
router.get("/get-recommended-blogs", getAllRecommendedBlogs);
router.get("/get-featured-blogs", getFeaturedBlogs);
router.get("/url/:url", getBlogByUrl);

export default router;