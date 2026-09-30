"use strict";

import { ulid } from "ulid";

/**
 * The chips from the listing design, so /recordings is not an empty filter row
 * on first deploy.
 *
 * Idempotent by slug. `config.js` sets no `seederStorage`, so sequelize-cli
 * keeps no record of what has run and `pg:seed:all` re-executes this every
 * time — a blind insert would either fail on the unique slug or, worse,
 * duplicate the chip row. Existing rows are left exactly as they are: `order`
 * and `name` are editable from the panel, and a re-run must not undo somebody's
 * reordering.
 */
const CATEGORIES = [
  { name: "Data Analytics Fundamentals", slug: "data-analytics-fundamentals" },
  { name: "SQL", slug: "sql" },
  { name: "Excel & Spreadsheets", slug: "excel-spreadsheets" },
  { name: "Python for Data Analysis", slug: "python-for-data-analysis" },
  { name: "Statistics", slug: "statistics" },
  { name: "Data Visualization", slug: "data-visualization" },
  { name: "Power BI / Tableau", slug: "power-bi-tableau" },
];

export default {
  async up(queryInterface) {
    const { sequelize } = queryInterface;

    const [existing] = await sequelize.query(
      'SELECT slug FROM "RecordingCategories"',
    );

    const known = new Set(existing.map((row) => row.slug));
    const now = new Date();

    const rows = CATEGORIES.filter((c) => !known.has(c.slug)).map(
      (category) => ({
        id: ulid(),
        name: category.name,
        slug: category.slug,
        // Index within the *seed list*, not within what is already there, so a
        // partial re-run cannot collapse two chips onto the same position.
        order: CATEGORIES.findIndex((c) => c.slug === category.slug) + 1,
        isActive: true,
        description: null,
        createdAt: now,
        updatedAt: now,
      }),
    );

    if (rows.length) {
      await queryInterface.bulkInsert("RecordingCategories", rows);
    }
  },

  async down(queryInterface) {
    const { Op } = await import("sequelize");

    await queryInterface.bulkDelete("RecordingCategories", {
      slug: { [Op.in]: CATEGORIES.map((c) => c.slug) },
    });
  },
};
