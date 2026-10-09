"use strict";

/**
 * The project's dataset — usually an Excel file uploaded from the panel, so an
 * S3/CDN URL, but any absolute http(s) link is accepted.
 *
 * Optional, unlike `downloadUrl`: plenty of projects bring their own data or
 * need none, so publishing does not check it.
 *
 * Gated exactly like `downloadUrl` — stripped from the public payload while the
 * download gate is on, and handed out only by the gate's own POST.
 */
// Schema-qualified on purpose: Sequelize's postgres `addColumn` prefixes a bare
// table name with `public.` instead of honouring search_path, so "Projects"
// alone fails against the "gradient" schema. Same default as config.js.
const PROJECTS = {
  tableName: "Projects",
  schema: process.env.DB_SCHEMA || "gradient",
};

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(PROJECTS, "datasetUrl", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(PROJECTS, "datasetUrl");
  },
};
