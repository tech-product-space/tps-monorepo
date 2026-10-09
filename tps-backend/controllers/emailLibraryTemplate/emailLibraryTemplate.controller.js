"use strict";

const { Op, fn, col, where: sqlWhere } = require("sequelize");
const { EmailLibraryTemplate, Campaign, Workflow, Event } = require("../../models");
const { EMAIL_TEMPLATE_TYPES } = require("../../constants/emailTemplate");
const { eventTemplateValues } = require("../../service/emailTemplate/eventTemplateValues");

const sendEmail = require("../../service/mail/sendEmail");
const {
  fillPlaceholders,
  findRelativeImages,
  renderTemplateEmail,
  sanitizeTemplateHtml,
  templateFieldKeys,
} = require("../../utils/email/templateHtml");

/**
 * The email template library. EMAIL_TEMPLATES_PLAN.md §4.4.
 *
 * Every authenticated admin may create, edit and archive templates. Nothing is
 * ever hard-deleted: campaigns keep a `template_id` for provenance, and an
 * archived template simply stops appearing in the picker.
 */

const TEST_SENDER = "info@theproductspace.in";
const TEST_SENDER_NAME = "The Product Space";

/** "register_url" → "Register URL". Used when no label was authored. */
const humanize = (key) =>
  key
    .split(/[._]/)
    .filter(Boolean)
    .map((word) =>
      ["url", "id", "cta"].includes(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");

/**
 * The field list for `html`: one entry per placeholder the admin fills in,
 * keeping any label already authored for that key.
 */
const resolveFields = (html, authored = []) => {
  const labels = new Map(
    (Array.isArray(authored) ? authored : [])
      .filter((f) => f && typeof f.key === "string")
      .map((f) => [f.key, typeof f.label === "string" && f.label.trim() ? f.label.trim() : null]),
  );

  return templateFieldKeys(html).map((key) => ({
    key,
    label: labels.get(key) || humanize(key),
  }));
};

/**
 * Validates and normalises an incoming html body. Returns `{ error }` or
 * `{ html, removed }`.
 */
const prepareHtml = (raw) => {
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: "Template HTML is required" };
  }

  const { html, removed } = sanitizeTemplateHtml(raw);

  // A relative image works on the author's disk and nowhere else. Refused
  // rather than warned about: it would ship as a broken image to everyone.
  const relative = findRelativeImages(html);
  if (relative.length) {
    return {
      error: `Upload these images first — they are not public URLs: ${relative.join(", ")}`,
    };
  }

  return { html, removed };
};

/** `undefined` = not sent; `null` = general; otherwise must be a known type. */
const parseType = (raw) => {
  if (raw === undefined) return { value: undefined };
  if (raw === null || raw === "") return { value: null };
  if (!EMAIL_TEMPLATE_TYPES.includes(raw)) {
    return { error: `Unknown template type "${raw}"` };
  }
  return { value: raw };
};

const nameTaken = async (name, excludeId) =>
  Boolean(
    await EmailLibraryTemplate.findOne({
      where: {
        is_archived: false,
        ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
        [Op.and]: [sqlWhere(fn("lower", col("name")), name.trim().toLowerCase())],
      },
      attributes: ["id"],
    }),
  );

/**
 * Where each template is in use: campaigns by column, workflow steps by
 * scanning the draft definitions (there are few workflows, and the node config
 * is JSON with no index to query).
 */
const usageFor = async (ids) => {
  const usage = Object.fromEntries(ids.map((id) => [id, { campaigns: [], workflows: [] }]));
  if (!ids.length) return usage;

  const campaigns = await Campaign.findAll({
    where: { template_id: { [Op.in]: ids } },
    attributes: ["id", "name", "status", "template_id"],
    order: [["updatedAt", "DESC"]],
  });

  for (const c of campaigns) {
    usage[c.template_id]?.campaigns.push({ id: c.id, name: c.name, status: c.status });
  }

  const workflows = await Workflow.findAll({
    attributes: ["id", "name", "status", "draft_definition"],
  });

  for (const w of workflows) {
    const nodes = w.draft_definition?.nodes || [];
    const seen = new Set();

    for (const node of nodes) {
      const templateId = node?.config?.template_id;
      if (templateId && usage[templateId] && !seen.has(templateId)) {
        seen.add(templateId);
        usage[templateId].workflows.push({ id: w.id, name: w.name, status: w.status });
      }
    }
  }

  return usage;
};

exports.listTemplates = async (req, res) => {
  try {
    const archived = req.query.archived === "true";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const type = typeof req.query.type === "string" ? req.query.type : null;

    const templates = await EmailLibraryTemplate.findAll({
      where: {
        is_archived: archived,
        ...(q ? { name: { [Op.iLike]: `%${q}%` } } : {}),
        ...(type ? { type: type === "general" ? null : type } : {}),
      },
      order: [["updatedAt", "DESC"]],
    });

    const usage = await usageFor(templates.map((t) => t.id));

    return res.json({
      templates: templates.map((t) => ({
        ...t.toJSON(),
        usage_count:
          usage[t.id].campaigns.length + usage[t.id].workflows.length,
      })),
    });
  } catch (error) {
    console.error("listTemplates error:", error);
    return res.status(500).json({ message: "Failed to fetch email templates" });
  }
};

exports.getTemplate = async (req, res) => {
  try {
    const template = await EmailLibraryTemplate.findByPk(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });

    return res.json({ template });
  } catch (error) {
    console.error("getTemplate error:", error);
    return res.status(500).json({ message: "Failed to fetch email template" });
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const { name, description, html: rawHtml, fields } = req.body || {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Template name is required" });
    }

    const type = parseType(req.body?.type);
    if (type.error) return res.status(400).json({ message: type.error });

    if (await nameTaken(name)) {
      return res.status(409).json({ message: `A template named "${name.trim()}" already exists` });
    }

    const prepared = prepareHtml(rawHtml);
    if (prepared.error) return res.status(400).json({ message: prepared.error });

    const template = await EmailLibraryTemplate.create({
      name: name.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
      type: type.value ?? null,
      html: prepared.html,
      fields: resolveFields(prepared.html, fields),
      size_bytes: Buffer.byteLength(prepared.html, "utf8"),
      created_by: req.staff?.id != null ? String(req.staff.id) : null,
      updated_by: req.staff?.id != null ? String(req.staff.id) : null,
    });

    return res.status(201).json({ template, removed: prepared.removed });
  } catch (error) {
    console.error("createTemplate error:", error);
    return res.status(500).json({ message: "Failed to create email template" });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const template = await EmailLibraryTemplate.findByPk(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });

    const { name, description, html: rawHtml, fields } = req.body || {};
    const updates = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Template name is required" });
      }
      if (await nameTaken(name, template.id)) {
        return res.status(409).json({ message: `A template named "${name.trim()}" already exists` });
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description =
        typeof description === "string" ? description.trim() || null : null;
    }

    const type = parseType(req.body?.type);
    if (type.error) return res.status(400).json({ message: type.error });
    if (type.value !== undefined) updates.type = type.value;

    let removed = [];

    if (rawHtml !== undefined) {
      const prepared = prepareHtml(rawHtml);
      if (prepared.error) return res.status(400).json({ message: prepared.error });

      updates.html = prepared.html;
      updates.size_bytes = Buffer.byteLength(prepared.html, "utf8");
      removed = prepared.removed;
    }

    // Recomputed whenever either side changes: new html can add or drop keys,
    // and new labels apply to whatever keys the html has.
    if (rawHtml !== undefined || fields !== undefined) {
      updates.fields = resolveFields(
        updates.html ?? template.html,
        fields !== undefined ? fields : template.fields,
      );
    }

    updates.updated_by = req.staff?.id != null ? String(req.staff.id) : template.updated_by;

    await template.update(updates);

    return res.json({ template, removed });
  } catch (error) {
    console.error("updateTemplate error:", error);
    return res.status(500).json({ message: "Failed to update email template" });
  }
};

exports.duplicateTemplate = async (req, res) => {
  try {
    const source = await EmailLibraryTemplate.findByPk(req.params.id);
    if (!source) return res.status(404).json({ message: "Template not found" });

    // "X (copy)", then "X (copy 2)" … until one is free.
    let name = `${source.name} (copy)`;
    for (let n = 2; await nameTaken(name); n += 1) {
      name = `${source.name} (copy ${n})`;
    }

    const template = await EmailLibraryTemplate.create({
      name,
      description: source.description,
      type: source.type,
      html: source.html,
      fields: source.fields,
      size_bytes: source.size_bytes,
      created_by: req.staff?.id != null ? String(req.staff.id) : null,
      updated_by: req.staff?.id != null ? String(req.staff.id) : null,
    });

    return res.status(201).json({ template });
  } catch (error) {
    console.error("duplicateTemplate error:", error);
    return res.status(500).json({ message: "Failed to duplicate email template" });
  }
};

exports.setArchived = async (req, res) => {
  try {
    const template = await EmailLibraryTemplate.findByPk(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });

    const isArchived = Boolean(req.body?.is_archived);

    // Unarchiving back into a name another live template has since taken
    // would leave two templates the picker cannot tell apart.
    if (!isArchived && (await nameTaken(template.name, template.id))) {
      return res.status(409).json({
        message: `Rename it first — another template is now called "${template.name}"`,
      });
    }

    await template.update({
      is_archived: isArchived,
      updated_by: req.staff?.id != null ? String(req.staff.id) : template.updated_by,
    });

    return res.json({ template });
  } catch (error) {
    console.error("setArchived error:", error);
    return res.status(500).json({ message: "Failed to update email template" });
  }
};

exports.getUsage = async (req, res) => {
  try {
    const template = await EmailLibraryTemplate.findByPk(req.params.id, {
      attributes: ["id"],
    });
    if (!template) return res.status(404).json({ message: "Template not found" });

    const usage = await usageFor([template.id]);
    return res.json(usage[template.id]);
  } catch (error) {
    console.error("getUsage error:", error);
    return res.status(500).json({ message: "Failed to fetch template usage" });
  }
};

/**
 * Sends the template itself, as a recipient would get it. Fields are shown as
 * `[Label]` rather than blanked, so the admin can see where each one lands.
 */
exports.sendTest = async (req, res) => {
  try {
    const { email } = req.body || {};

    if (typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ message: "A valid email address is required" });
    }

    const template = await EmailLibraryTemplate.findByPk(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });

    const fieldValues = Object.fromEntries(
      (template.fields || []).map((f) => [f.key, `[${f.label || humanize(f.key)}]`]),
    );

    const html = renderTemplateEmail({
      html: fillPlaceholders(template.html, fieldValues),
      recipient: { name: "Test User", email: email.trim(), phone: "+91 90000 00000" },
    });

    const result = await sendEmail({
      to: email.trim(),
      subject: `[TEST] ${template.name}`,
      html,
      from: TEST_SENDER,
      fromName: TEST_SENDER_NAME,
      meta: {
        source: "OTHER",
        sourceId: template.id,
        sourceName: `Template test: ${template.name}`,
        extra: { isTest: true, templateId: template.id },
      },
    });

    if (result !== "success") {
      return res.status(502).json({ message: "The email provider refused the test send" });
    }

    return res.json({ message: `Test email sent to ${email.trim()}` });
  } catch (error) {
    console.error("sendTest error:", error);
    return res.status(500).json({ message: "Failed to send test email" });
  }
};

/**
 * Events to choose from when a campaign is built from an event template.
 * Newest first — the one being promoted is almost always upcoming or recent.
 */
exports.listEvents = async (req, res) => {
  try {
    const events = await Event.findAll({
      attributes: ["id", "eventTitle", "eventType", "eventStartDate", "eventSlug", "isPublished"],
      order: [
        ["eventStartDate", "DESC NULLS LAST"],
        ["createdAt", "DESC"],
      ],
      limit: 200,
    });

    return res.json({
      events: events.map((e) => ({
        id: e.id,
        title: e.eventTitle,
        type: e.eventType,
        startDate: e.eventStartDate,
        slug: e.eventSlug,
        isPublished: e.isPublished,
      })),
    });
  } catch (error) {
    console.error("listEvents error:", error);
    return res.status(500).json({ message: "Failed to fetch events" });
  }
};

/** The chosen event's details as template values — see eventTemplateValues.js. */
exports.getEventValues = async (req, res) => {
  try {
    const event = await Event.findByPk(req.params.eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    return res.json({
      event: { id: event.id, title: event.eventTitle },
      ...eventTemplateValues(event),
    });
  } catch (error) {
    console.error("getEventValues error:", error);
    return res.status(500).json({ message: "Failed to read the event" });
  }
};
