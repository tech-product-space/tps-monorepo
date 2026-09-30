const express = require("express");
const { addBlog, getAllBlogs, getBlogById, editBlog, deleteBlog, toggleFeaturedStatus,toggleRecommendedStatus, getBlogsByUrl, getLatestBlogsByCategory,getAllBlogsPaginated, getAdminBlogsPaginated, schedulePublish ,cancelSchedulePublish, updateBlogPublishStatus, checkSlugAvailability} = require("../controllers/blogController");

const router = express.Router();

router.post("/add", addBlog);
router.get("/", getAllBlogs);
router.get("/all-blogs", getAllBlogsPaginated);
router.get("/admin/all-blogs", getAdminBlogsPaginated);
router.get('/latest', getLatestBlogsByCategory);
router.get('/slug-availability', checkSlugAvailability);
router.post('/schedule', schedulePublish)
router.post('/:blogId/cancel', cancelSchedulePublish)
router.get("/:id", getBlogById);
router.patch("/featured/:id", toggleFeaturedStatus);
router.patch("/recommended/:id", toggleRecommendedStatus);
router.put("/edit/:id", editBlog);
router.delete("/delete/:id", deleteBlog);
router.post("/search", getBlogsByUrl);
router.post("/:id/publish", updateBlogPublishStatus);

module.exports = router;