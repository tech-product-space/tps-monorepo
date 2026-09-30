"use strict";

const { ulid } = require("ulid");

/**
 * The chip row on /recordings, in the order it renders.
 *
 * A starter set aimed at what The Product Space actually records — product
 * management, AI and careers — not a copy of the data-analytics taxonomy this
 * feature was first built for. Edit freely before seeding: the seeder is
 * idempotent by slug, so adding entries here and re-running is safe, and the
 * admin panel can rename, retire and reorder chips afterwards.
 *
 * The one thing that is expensive to change later is a **slug**: it goes in the
 * URL (`/recordings?category=product-strategy`) and people bookmark it.
 */
const CATEGORIES = [
  { name: "Product Management", slug: "product-management" },
  { name: "AI for PMs", slug: "ai-for-pms" },
  { name: "Product Strategy", slug: "product-strategy" },
  { name: "Product Analytics", slug: "product-analytics" },
  { name: "Case Studies & Teardowns", slug: "case-studies-teardowns" },
  { name: "Interview Prep", slug: "interview-prep" },
  { name: "Career Transitions", slug: "career-transitions" },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;

    const existing = await sequelize.query(
      `SELECT slug FROM "RecordingCategories"`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const seen = new Set(existing.map((row) => row.slug));
    const now = new Date();

    const rows = CATEGORIES.filter((c) => !seen.has(c.slug)).map((c, index) => ({
      id: ulid(),
      name: c.name,
      slug: c.slug,
      // Position within the seed list, not within the table — a chip added by
      // hand before this ran keeps whatever order it was given.
      order: index,
      isActive: true,
      description: null,
      createdAt: now,
      updatedAt: now,
    }));

    if (rows.length) {
      await queryInterface.bulkInsert("RecordingCategories", rows);
    }
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;

    // Only the chips this seeder created, and only while nothing is filed under
    // them. The FK is ON DELETE SET NULL, so an unguarded rollback would leave
    // real recordings uncategorised — invisible to the only navigation the
    // section has, with nothing on screen to say why.
    await sequelize.query(
      `DELETE FROM "RecordingCategories"
        WHERE slug IN (:slugs)
          AND id NOT IN (SELECT "categoryId" FROM "Recordings"
                          WHERE "categoryId" IS NOT NULL)`,
      { replacements: { slugs: CATEGORIES.map((c) => c.slug) } }
    );
  },
};
