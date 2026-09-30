const { Op } = require("sequelize");
const { WhatsappTemplate } = require("../models");
const { canManageProgramSettings } = require("../config/constants/roles");

/* ─── VARIABLES ────────────────────────────────────────────────────────────── */

const TEMPLATE_VARIABLES = [
  { token: "{{name}}", description: "Lead's first name" },
  { token: "{{sender_name}}", description: "Your first name" },
  { token: "{{product}}", description: "Product / program name" },
  { token: "{{email}}", description: "Lead's email" },
];

const SUPERADMIN = "Superadmin";

// wa.me links have no official WhatsApp limit, but very long URLs silently
// fail to open in some mobile browsers/WhatsApp builds — cap the raw body
// length here; the frontend separately caps the encoded URL at send time.
const MAX_BODY_LENGTH = 2000;

/* ─── CRUD ─────────────────────────────────────────────────────────────────── */

/**
 * A user sees their own templates plus all default (Superadmin-created) ones.
 */
async function listTemplates(user) {
  return WhatsappTemplate.findAll({
    where: {
      [Op.or]: [{ created_by: user.id }, { is_default: true }],
    },
    order: [
      ["is_default", "DESC"],
      ["created_at", "DESC"],
    ],
  });
}

async function getTemplateById(id) {
  const template = await WhatsappTemplate.findByPk(id);
  if (!template) throw new Error("WhatsApp template not found");
  return template;
}

async function createTemplate({ name, body, is_default, user }) {
  if (!name?.trim()) throw new Error("Template name is required");
  if (!body?.trim()) throw new Error("Message body is required");
  if (body.trim().length > MAX_BODY_LENGTH) {
    throw new Error(`Message body must be ${MAX_BODY_LENGTH} characters or fewer`);
  }

  // Only template administrators can create defaults visible to everyone
  const isDefault = canManageProgramSettings(user.role) ? Boolean(is_default) : false;

  return WhatsappTemplate.create({
    name: name.trim(),
    body: body.trim(),
    is_default: isDefault,
    created_by: user.id,
  });
}

function assertCanManage(template, user) {
  if (template.created_by !== user.id && !canManageProgramSettings(user.role)) {
    throw new Error("Not allowed to modify this template");
  }
}

async function updateTemplate(id, updates, user) {
  const template = await getTemplateById(id);
  assertCanManage(template, user);

  if (updates.name !== undefined) {
    if (!String(updates.name).trim()) throw new Error("Template name is required");
    template.name = String(updates.name).trim();
  }
  if (updates.body !== undefined) {
    const trimmedBody = String(updates.body).trim();
    if (!trimmedBody) throw new Error("Message body is required");
    if (trimmedBody.length > MAX_BODY_LENGTH) {
      throw new Error(`Message body must be ${MAX_BODY_LENGTH} characters or fewer`);
    }
    template.body = trimmedBody;
  }
  if (updates.is_default !== undefined && user.role === SUPERADMIN) {
    template.is_default = Boolean(updates.is_default);
  }

  await template.save();
  return template;
}

async function deleteTemplate(id, user) {
  const template = await getTemplateById(id);
  assertCanManage(template, user);
  await template.destroy();
  return { success: true };
}

module.exports = {
  TEMPLATE_VARIABLES,
  MAX_BODY_LENGTH,
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
