"use strict";
const { ulid } = require("ulid");

/**
 * A reusable, full-document email (EMAIL_TEMPLATES_PLAN.md §4.1).
 *
 * Not `EmailTemplate` — that name is the per-event email body table. Choosing
 * one of these *copies* its html into the campaign or workflow step, so editing
 * a template never changes an email that was already built from it.
 *
 * `fields` holds labels for the placeholders the admin fills in when applying
 * the template, e.g. [{ key: "register_url", label: "Register URL" }]. The keys
 * are recomputed from `html` on every save; only the labels are authored.
 */
module.exports = (sequelize, DataTypes) => {
  const EmailLibraryTemplate = sequelize.define(
    "EmailLibraryTemplate",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      description: DataTypes.TEXT,

      // 'event', or null for a general template. See EMAIL_TEMPLATE_TYPES.
      type: DataTypes.STRING,

      html: {
        type: DataTypes.TEXT,
        allowNull: false,
      },

      fields: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },

      size_bytes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      is_archived: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      created_by: DataTypes.STRING,

      updated_by: DataTypes.STRING,
    },
    {
      tableName: "email_library_templates",
    },
  );

  return EmailLibraryTemplate;
};
