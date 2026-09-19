const { blogs } = require("../models");
const { Op } = require("sequelize");
const { getPaginationParams, getMeta } = require("../utils/pagination");
const { scheduleBlogPublish,cancelBlogPublish } = require("../jobs/blogScheduler");
// ✅ Add a New Blog
const addBlog = async (req, res) => {
    try {
        const blog = await blogs.create(req.body);
        res.status(201).json({ message: "Blog added successfully", blog });
    } catch (error) {
        res.status(500).json({ error: "Failed to add blog", details: error.message });
    }
};

// ✅ Get All Blogs
const getAllBlogs = async (req, res) => {
    try {
        const placement = req.query.placement || "blog";
        const blog = await blogs.findAll({ where: { placement } });
        res.json(blog);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch blogs", details: error.message });
    }
};

// ✅ Get All Blogs Paginated
const getAllBlogsPaginated = async (req, res) => {
  try {

  const { page, limit, offset } = getPaginationParams(req.query);
  const categories = req.query.categories
    ? req.query.categories.split(",")
    : [];

  const sortBy = req.query.sortBy || "newest";
  const type = req.query.type || "all";
  const placement = req.query.placement || "blog";

  let order = [["publishedDate", "DESC"]];
  if (sortBy === "oldest") order = [["publishedDate", "ASC"]];
  if (sortBy === "popular") order = [["title", "ASC"]];

  const where = { placement };

  if (type !== "all") {
    where.type = type;
    where.url =  { [Op.ne]: "" }
  }

  if (categories.length > 0) {
    where.category = categories;
  }

    const { count, rows } = await blogs.findAndCountAll({
        where,
        limit,
        offset,
        order,
    });

    const meta = getMeta(count, page, limit);

    res.json({
      success: true,
      meta,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch blogs",
      details: error.message,
    });
  }
};

// ✅ Admin blog listing — separate from the public `getAllBlogsPaginated` so the
// public /blogs page is unaffected. Sorts by createdAt (newest first) and
// supports free-text search across title, author, category and slug (url).
const getAdminBlogsPaginated = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const placement = req.query.placement || "blog";
    const search = (req.query.search || "").trim();

    const where = { placement };

    if (search) {
      const like = { [Op.iLike]: `%${search}%` };
      where[Op.or] = [
        { title: like },
        { author: like },
        { category: like },
        { url: like },
      ];
    }

    const { count, rows } = await blogs.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const meta = getMeta(count, page, limit);

    res.json({
      success: true,
      meta,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch blogs",
      details: error.message,
    });
  }
};

// ✅ Get a Single Blog by ID
const getBlogById = async (req, res) => {
    try {
        const blog = await blogs.findByPk(req.params.id);
        if (!blog) return res.status(404).json({ error: "Blog not found" });
        res.json(blog);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch blog", details: error.message });
    }
};

// ✅ Edit a Blog by ID
const editBlog = async (req, res) => {
    try {
        const blog = await blogs.findByPk(req.params.id);
        if (!blog) return res.status(404).json({ error: "Blog not found" });

        await blog.update(req.body);
        res.json({ message: "Blog updated successfully", blog });
    } catch (error) {
        res.status(500).json({ error: "Failed to update blog", details: error.message });
    }
};

// ✅ Delete a Blog by ID
const deleteBlog = async (req, res) => {
    try {
        const blog = await blogs.findByPk(req.params.id);
        if (!blog) return res.status(404).json({ error: "Blog not found" });

        await blog.destroy();
        res.json({ message: "Blog deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete blog", details: error.message });
    }
};

// ✅ Toggle "featured" field
const toggleFeaturedStatus = async (req, res) => {
    const { id } = req.params;

    try {
        const blog = await blogs.findByPk(id);
        if (!blog) return res.status(404).json({ error: "Blog not found" });

        blog.featured = !blog.featured;
        await blog.save();

        res.json({ message: "Featured status toggled", featured: blog.featured });
    } catch (error) {
        res.status(500).json({ error: "Failed to toggle featured status", details: error.message });
    }
};

// ✅ Toggle "recommended" field
const toggleRecommendedStatus = async (req, res) => {
    const { id } = req.params;

    try {
        const blog = await blogs.findByPk(id);
        if (!blog) return res.status(404).json({ error: "Blog not found" });

        blog.recommended = !blog.recommended;
        await blog.save();

        res.json({ message: "Recommended status toggled", recommended: blog.recommended });
    } catch (error) {
        res.status(500).json({ error: "Failed to toggle recommended status", details: error.message });
    }
};

// ✅ Get Blogs by Title (Case-insensitive search)
const getBlogsByUrl = async (req, res) => {
    const { url, placement } = req.body;

    if (!url) return res.status(400).json({ error: "Url query parameter is required" });

    try {
        // The public route passes the slug with dashes turned into spaces (a v1
        // convention where urls were stored with spaces). v2 stores dash-slugs,
        // so match both the space form and the dash form.
        const variants = [url];
        const dashed = url.replace(/\s+/g, "-");
        if (dashed !== url) variants.push(dashed);

        const where = { url: { [Op.in]: variants } };
        if (placement) where.placement = placement;

        const blogList = await blogs.findAll({ where });
        res.json(blogList);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch blogs by title", details: error.message });
    }
};

// GET /blogs/slug-availability?slug=my-slug
// Used by the v2 editor to check whether a URL slug is already taken.
const checkSlugAvailability = async (req, res) => {
    const { slug, blogId } = req.query;

    if (!slug) return res.status(400).json({ error: "slug query parameter is required" });

    try {
        const where = { url: slug.trim() };
        // When editing, ignore the blog's own current slug.
        if (blogId) where.blog_id = { [Op.ne]: blogId };

        const existing = await blogs.findOne({ where });
        res.json({ available: !existing });
    } catch (error) {
        res.status(500).json({ error: "Failed to check slug availability", details: error.message });
    }
};

// GET /blogs/latest?category=technology

const getLatestBlogsByCategory = async (req, res) => {
    const { category, id } = req.query;
    const placement = req.query.placement || "blog";

    if (!category) return res.status(400).json({ error: "Category query parameter is required" });

    try {
        const whereClause = {
            category,
            type: 'publish',
            placement,
        };

        if (id) {
            whereClause.blog_id = { [Op.not]: id };
        }

        const latestBlogs = await blogs.findAll({
            where: whereClause,
            order: [['publishedDate', 'DESC']],
            limit: 3
        });

        res.json(latestBlogs);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch latest blogs", details: error.message });
    }
};

//POST /blogs/schedule
const schedulePublish = async (req, res) => {
  const { blogId, publishAt } = req.body;
  
//   const publishAt = new Date(Date.now() + 1 * 60 * 1000);

  const blog = await blogs.findByPk(blogId);

  if (!blog) {
    return res.status(404).json({ message: "Blog not found" });
  }

  // Save scheduled date
  blog.scheduledAt = publishAt;
  blog.type = "draft";
  await blog.save();

  // Schedule agenda job
  await scheduleBlogPublish(blogId, publishAt);

  res.json({
    message: "✅ Blog publish scheduled successfully",
    blogId,
    publishAt,
  });
};


// POST /blogs/:blogId/cancel
const cancelSchedulePublish = async (req, res) => {
  try {
    const { blogId } = req.params;

    const blog = await blogs.findByPk(blogId);

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    if (!blog.scheduledAt) {
      return res.status(400).json({
        message: "Blog is not scheduled",
      });
    }

    await cancelBlogPublish(blogId);

    blog.scheduledAt = null;
    blog.type = "draft"; 

    await blog.save();

    res.status(200).json({
      message: "Blog publish schedule cancelled successfully",
    });
  } catch (error) {
    console.error("❌ Cancel blog publish error:", error.message);

    res.status(500).json({
      message: "Failed to cancel blog publish schedule",
      error: error.message,
    });
  }
};


const updateBlogPublishStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (status !== "publish" && status !== "draft") {
      return res.status(400).json({
        error: "'status' must be either 'publish' or 'draft'",
      });
    }

    const blog = await blogs.findByPk(id);

    if (!blog) {
      return res.status(404).json({
        error: "Blog not found",
      });
    }

    blog.type = status;
    await blog.save();

    return res.status(200).json({
      result: "SUCCESS",
      message: `Blog ${status === "publish" ? "published" : "drafted"} successfully`,
      blog,
    });
  } catch (error) {
    console.error("Error updating publish status:", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
};
module.exports = { addBlog, schedulePublish,cancelSchedulePublish, getAllBlogsPaginated, getAdminBlogsPaginated, getAllBlogs, getBlogById, editBlog, deleteBlog, toggleFeaturedStatus, toggleRecommendedStatus, getBlogsByUrl, getLatestBlogsByCategory ,updateBlogPublishStatus, checkSlugAvailability };