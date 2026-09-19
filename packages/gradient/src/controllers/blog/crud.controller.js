import db from "../../database/postgres/models/index.js";
const { Blog } = db;

import { Op } from "sequelize";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import toSlug from "../../util/helpers/slugHelpers.js";
import sanitizeQuiz from "../../util/helpers/quizHelpers.js";

export const createBlog = asyncWrapper(async (req, res) => {
  const { title, category, url, subTitle } = req.body;

  // Basic validation
  if (!title || !category || !url) {
    return res.status(400).json({
      success: false,
      message: "title, category and url are required",
    });
  }

  // Create blog
  const blog = await Blog.create({
    title,
    category,
    url,
    subTitle: subTitle || "",
    status: "draft",
    content: {},
  });

  return res.status(201).json({
    success: true,
    data: blog,
  });
});

export const getAllBlogs = asyncWrapper(async (req, res) => {
  const blogs = await Blog.findAll({
    attributes: [
      "id",
      "title",
      "subTitle",
      "publishedDate",
      "category",
      "scheduledAt",
      "status",
      "isFeatured",
      "createdAt",
      "updatedAt",
    ],
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data: blogs,
  });
});

export const deleteBlog = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Blog id is required",
    });
  }

  const blog = await Blog.findByPk(id);

  if (!blog) {
    return res.status(404).json({
      success: false,
      message: "Blog not found",
    });
  }

  // Captured before the row goes — the log's automatic label lookup cannot help
  // once the record is deleted.
  req.activity?.set({ entityLabel: blog.title });

  await blog.destroy();

  return res.status(200).json({
    success: true,
    message: "Blog deleted successfully",
  });
});

export const getBlogById = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const blog = await Blog.findByPk(id);

  if (!blog) {
    return res.status(404).json({
      success: false,
      message: "Blog not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: blog,
  });
});

export const updateBlog = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const blog = await Blog.findByPk(id);
  if (!blog) {
    return res.status(404).json({
      success: false,
      message: "Blog not found",
    });
  }

  const payload = { ...req.body };

  // The quiz drives client-side scoring, so drop malformed questions instead of
  // persisting a shape the public page cannot render.
  if ("quiz" in payload) {
    payload.quiz = sanitizeQuiz(payload.quiz);
  }

  await blog.update(payload);

  return res.status(200).json({
    success: true,
    data: blog,
  });
});

export const toggleBlogStatus = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const blog = await Blog.findByPk(id);

  if (!blog) {
    return res.status(404).json({
      success: false,
      message: "Blog not found",
    });
  }

  // Validate current status
  if (!["draft", "published"].includes(blog.status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid current status: ${blog.status}`,
    });
  }

  // Explicit toggle
  let newStatus;
  if (blog.status === "draft") {
    newStatus = "published";
  } else {
    newStatus = "draft";
  }

  await blog.update({ status: newStatus });

  return res.status(200).json({
    success: true,
    message: `Blog ${newStatus === "published" ? "published" : "moved to draft"
      } successfully`,
    data: {
      id: blog.id,
      status: newStatus,
    },
  });
});

export const checkSlugAvailability = asyncWrapper(async (req, res) => {
  const rawSlug = req.query.slug?.trim();

  if (!rawSlug) {
    return res.status(400).json({
      result: "ERROR",
      error: "Slug is required",
    });
  }

  const slug = toSlug(rawSlug);

  const existing = await Blog.findOne({
    where: { url: { [Op.iLike]: slug } },
  });

  if (existing) {
    return res.status(200).json({
      result: "SUCCESS",
      available: false,
      slug,
      message: "URL already taken",
    });
  }

  return res.status(200).json({
    result: "SUCCESS",
    available: true,
    slug,
    message: "URL is available",
  });
});

export const getAllPublishedBlogs = asyncWrapper(async (req, res) => {
  const blogs = await Blog.findAll({
    attributes: [
      "title",
      "subTitle",
      "authorDetails",
      "publishedDate",
      "category",
      "tags",
      "thumbnailSrc",
      "thumbnailAlt",
      "url",
    ],
    where: {
      status: "published",
    },
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data: blogs,
  });
});


export const getAllRecommendedBlogs = asyncWrapper(async (req, res) => {
  const { category, slug } = req.query;

  if (!category) {
    return res.status(400).json({
      success: false,
      message: "category is required",
    });
  }

  const blogs = await Blog.findAll({
    attributes: [
      "title",
      "subTitle",
      "authorDetails",
      "publishedDate",
      "category",
      "tags",
      "thumbnailSrc",
      "thumbnailAlt",
      "url",
    ],
    where: {
      status: "published",
      category,
      ...(slug && { url: { [Op.ne]: slug } }), 
    },
    order: [["publishedAt", "DESC"]],
    limit: 3,
  });

  return res.status(200).json({
    success: true,
    count: blogs.length,
    data: blogs,
  });
});

export const getFeaturedBlogs = asyncWrapper(async (req, res) => {
  const blogs = await db.Blog.findAll({
    where: {
      isFeatured: true,
      status: "published"
    },
    attributes: [
      "title",
      "subTitle",
      "authorDetails",
      "publishedDate",
      "category",
      "tags",
      "thumbnailSrc",
      "thumbnailAlt",
      "url",
    ],
    order: [["createdAt", "DESC"]],
    limit: 5,
  });

  return res.status(200).json({
    success: true,
    data: blogs,
  });
});

export const getBlogByUrl = asyncWrapper(async (req, res) => {
  const { url } = req.params;

  const blog = await Blog.findOne({
    where: { url },
    attributes: { exclude: ["id"] },
  });

  if (!blog) {
    return res.status(404).json({
      success: false,
      message: "Blog not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: blog,
  });
});
