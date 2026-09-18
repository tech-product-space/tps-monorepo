const { Op } = require("sequelize");
const { Resource, ResourceLead, sequelize } = require("../models");
const { sendGraphEmail } = require("../utils/email/sendGraphEmail");
const { toSlug } = require("../utils/slugHelpers");

const replacePlaceholders = (body, replacements) => {
    const withValues = body.replace(/{{(.*?)}}/g, (_, key) => {
        return replacements[key.trim()] ?? "";
    });
    return withValues.replace(/\n/g, "<br>");
};

const cleanHtml = (html) => {
    return html
        .replace(/white-space:\s*pre-wrap;?/g, "")
        .replace(/white-space:\s*pre;?/g, "")
        .replace(/<p\b[^>]*>/gi, "<div>")   // replace opening <p ...> with <div>
        .replace(/<\/p>/gi, "</div>");       // replace closing </p> with </div>
};

const wrapEmailTemplate = (content) => {
    return `
  <style>
    @media only screen and (max-width: 600px) {
      .tps-pad { padding-left: 0 !important; padding-right: 0 !important; }
    }
  </style>

  <div style="background-color: #f3f4f6; width: 100%;">
    <div class="tps-pad" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 24px; font-size: 14px; font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      ${content}
    </div>
  </div>
  `;
};

exports.upsertResource = async (req, res) => {
    try {
        const { id, ...data } = req.body;

        let resource;
        if (id) {
            // Update if exists
            resource = await Resource.findByPk(id);
            if (!resource) {
                return res.status(404).json({ error: "Resource not found" });
            }
            await resource.update({ ...data });
        } else {
            // Create new
            resource = await Resource.create(data);
        }

        return res.json(resource);
    } catch (error) {
        console.error("Error in upsertResource:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.getResourceById = async (req, res) => {
    try {
        const { id } = req.params;
        const resource = await Resource.findByPk(id);

        if (!resource) {
            return res.status(404).json({ error: "Resource not found" });
        }

        return res.json(resource);
    } catch (error) {
        console.error("Error in getResourceById:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.getAllResources = async (req, res) => {
    try {
        const resources = await Resource.findAll({
            attributes: { exclude: ["resourceDetails"] },
        });
        return res.json(resources);
    } catch (error) {
        console.error("Error in getAllResources:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.getResources = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 9;
        const offset = (page - 1) * limit;

        const { count, rows } = await Resource.findAndCountAll({
            attributes: [
                "id",
                "resourceCategory",
                "resourceType",
                "subtitle",
                "thumbnail",
                "title",
                "tagPrimary",
                "tagSecondary",
                "resourceSlug"
            ],
            where: { isPublished: true },
            limit,
            offset,
            order: [["createdAt", "DESC"]],
        });

        res.json({
            total: count,
            page,
            totalPages: Math.ceil(count / limit),
            resources: rows,
        });
    } catch (error) {
        console.error("Error in getResources:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};


exports.createLead = async (req, res) => {
    try {
        const { resourceId, ...data } = req.body;

        const resource = await Resource.findByPk(resourceId);

        if (!resource) {
            return res.status(404).json({ error: "Resource not found" });
        }

        const lead = await ResourceLead.create({ resourceId, ...data });

        let emailResult = null;

        if (resource.emailTemplate) {
            const htmlContent = wrapEmailTemplate(
                cleanHtml(
                    replacePlaceholders(resource.emailTemplate.body, {
                        name: data.name
                    })
                )
            );
            emailResult = await sendGraphEmail({
                to: data.email,
                subject: resource.emailTemplate.subject,
                html: htmlContent,
            });
        }


        // return res.json(lead);
        res.status(200).json({ result: lead, emailResult, message: `Emails sent to ${data.email}.` });
    } catch (error) {
        console.error("Error in createLead:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.getLeadsByResourceId = async (req, res) => {
    try {
        const { id } = req.params;

        const leads = await ResourceLead.findAll({
            where: { resourceId: id }
        });

        if (!leads || leads.length === 0) {
            return res.status(404).json({ error: "No leads found for this resource" });
        }

        return res.json(leads);
    } catch (error) {
        console.error("Error in getLeadsByResourceId:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.getAllLeads = async (req, res) => {
    try {
        const leads = await ResourceLead.findAll({
            include: [{ model: Resource, as: "resource" }],
        });
        return res.json(leads);
    } catch (error) {
        console.error("Error in getAllLeads:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.updatePublishStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isPublished } = req.body;

        const resource = await Resource.findByPk(id);
        if (!resource) {
            return res.status(404).json({ error: "Resource not found" });
        }

        resource.isPublished = isPublished;
        await resource.save();

        return res.json({ message: "Publish status updated", resource });
    } catch (error) {
        console.error("Error in updatePublishStatus:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};



exports.deleteResource = async (req, res) => {
    try {
        const { id } = req.params;
        const resource = await Resource.findByPk(id);

        if (!resource) {
            return res.status(404).json({ error: "Resource not found" });
        }
        await resource.destroy();

        return res.status(200).json({
            result: "SUCCESS",
            message: "Resource deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting event:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

// GET /resources/slug-availability?slug=<slug>&excludeId=<resource_id>
exports.checkSlugAvailability = async (req, res) => {
    try {
        const rawSlug = req.query.slug?.trim();
        const resourceId = req.query.excludeId || null;

        if (!rawSlug) {
            return res.status(400).json({
                result: "ERROR",
                error: "Slug is required",
            });
        }

        const slug = toSlug(rawSlug);

        // Check if slug already exists (case-insensitive)
        const whereCondition = {
            [Op.and]: [
                sequelize.where(
                    sequelize.fn("LOWER", sequelize.col("resourceSlug")),
                    slug.toLowerCase()
                ),
            ],
        };

        if (resourceId) {
            whereCondition[Op.and].push({
                id: { [Op.ne]: resourceId },
            });
        }

        const existing = await Resource.findOne({ where: whereCondition });

        if (existing) {
            return res.status(200).json({
                result: "SUCCESS",
                available: false,
                slug,
                message: "URL already taken"
            });
        }

        return res.status(200).json({
            result: "SUCCESS",
            available: true,
            slug,
            message: "URL is available"
        });

    } catch (error) {
        console.error("Error checking slug availability:", error);
        return res.status(500).json({
            result: "ERROR",
            available: false,
            message: "Internal server error"
        });
    }
};

// GET /resources/slug/:slug
exports.getBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        if (!slug) {
            return res.status(400).json({
                error: "'slug' is required",
            });
        }

        const resource = await Resource.findOne({
            where: { resourceSlug: slug },
            attributes: {
                exclude: ["emailTemplate", "createdAt", "updatedAt" , "isPublished"],
            },
        });

        if (!resource) {
            return res.status(404).json({
                error: "Resource not found",
            });
        }

        return res.status(200).json({
            result: "SUCCESS",
            resource,
        });
    } catch (error) {
        console.error("Error fetching resource by slug:", error);
        return res.status(500).json({
            result: "ERROR",
            message: "Internal server error",
        });
    }
};  