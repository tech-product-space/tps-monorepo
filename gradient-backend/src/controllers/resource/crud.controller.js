import db from "../../database/postgres/models/index.js";
const { Resource } = db;

import { Sequelize } from "sequelize";
import { Op } from "sequelize";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import toSlug from "../../util/helpers/slugHelpers.js";

export const createResource = asyncWrapper(async (req, res) => {
  const {
    title,
    resourceCategory,
    resourceType,
    subtitle,
    resourceSlug,
    isPublished = false,
    seo = {},
  } = req.body;

  if (!title || !resourceCategory || !resourceSlug) {
    return res.status(400).json({
      success: false,
      message: "title, resourceCategory and resourceSlug are required",
    });
  }

  const resource = await Resource.create({
    title,
    resourceCategory,
    resourceType,
    subtitle,
    resourceSlug,
    seo,
    isPublished,
  });

  return res.status(201).json({
    success: true,
    data: resource,
  });
});

export const getAllResources = asyncWrapper(async (req, res) => {
  const resources = await Resource.findAll({
    attributes: [
      "id",
      "title",
      "subtitle",
      "resourceCategory",
      "resourceType",
      "resourceSlug",
      "isPublished",
      "createdAt",
      "updatedAt",
    ],
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data: resources,
  });
});

export const deleteResource = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Resource id is required",
    });
  }

  const resource = await Resource.findByPk(id);

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: "Resource not found",
    });
  }

  // Captured before the row goes — the log's automatic label lookup cannot help
  // once the record is deleted.
  req.activity?.set({ entityLabel: resource.title });

  await resource.destroy();

  return res.status(200).json({
    success: true,
    message: "Resource deleted successfully",
  });
});

export const getResourceById = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const resource = await Resource.findByPk(id);

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: "Resource not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: resource,
  });
});

export const updateResource = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const resource = await Resource.findByPk(id);
  if (!resource) {
    return res.status(404).json({
      success: false,
      message: "Resource not found",
    });
  }

  await resource.update(req.body);

  return res.status(200).json({
    success: true,
    data: resource,
  });
});

export const toggleResourceStatus = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const resource = await Resource.findByPk(id);

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: "Resource not found",
    });
  }

  // Toggle logic
  const newStatus = !resource.isPublished;

  await resource.update({ isPublished: newStatus });

  return res.status(200).json({
    success: true,
    message: `Resource ${newStatus ? "published" : "moved to draft"} successfully`,
    data: {
      id: resource.id,
      isPublished: newStatus,
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

  const existing = await Resource.findOne({
    where: { resourceSlug: { [Op.iLike]: slug } },
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

export const getAllPublishedResources = asyncWrapper(async (req, res) => {
  const resources = await Resource.findAll({
    attributes: [
      "id",
      "title",
      "subtitle",
      "resourceCategory",
      "resourceType",
      "thumbnailSrc",
      "resourceSlug",
      "seo",
      [
        Sequelize.literal(`"resourceContent"->>'publishedDate'`),
        "publishedDate"
      ]
    ],
    where: {
      isPublished: true,
    },
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data: resources,
  });
});

export const getResourceBySlug = asyncWrapper(async (req, res) => {
  const { slug } = req.params;

  const resource = await Resource.findOne({
    where: { resourceSlug: slug },
    attributes: { exclude: ["createdAt", "updatedAt", "isPublished", "scheduledAt", "emailTemplate", "resourceDetails"] },
  });

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: "Resource not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: resource,
  });
});

export const getResourceDetailsBySlug = asyncWrapper(async (req, res) => {
  const { slug } = req.params;

  const resource = await Resource.findOne({
    where: { resourceSlug: slug },
    attributes: ["id", "resourceDetails"],
  });

  if (!resource) {
    return res.status(404).json({
      success: false,
      message: "Resource not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: resource,
  });
});

export const updateEmailTemplate = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { emailTemplate } = req.body;

  if (!emailTemplate || typeof emailTemplate !== "object") {
    return res.status(400).json({
      message: "'emailTemplate' must be an object",
    });
  }

  const { subject, body } = emailTemplate;

  if (!subject || typeof subject !== "string") {
    return res.status(400).json({
      message: "'emailTemplate.subject' is required and must be a string",
    });
  }

  if (!body || typeof body !== "string") {
    return res.status(400).json({
      message: "'emailTemplate.body' is required and must be a string",
    });
  }

  const resource = await Resource.findByPk(id);

  if (!resource) {
    return res.status(404).json({
      message: "Resource not found",
    });
  }

  await resource.update({
    emailTemplate: {
      subject,
      body,
    },
  });

  return res.status(200).json({
    message: "Resource email template updated",
  });
});
