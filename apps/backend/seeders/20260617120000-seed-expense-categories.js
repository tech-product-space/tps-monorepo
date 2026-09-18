"use strict";

const { ulid } = require("ulid");

// Common business-expense categories (with a few starter subcategories each)
// for a fresh production database. Tailored for an Indian company — note the
// GST/TDS/professional-tax entries under "Taxes & Government Fees".
//
// Edit this list freely before seeding; the seeder is idempotent (it inserts
// only categories/subcategories that don't already exist by name), so adding
// new entries here and re-running is safe.
const CATEGORIES = [
  {
    name: "Salaries & Wages",
    subcategories: ["Full-time salaries", "Contractor payments", "Bonuses & incentives", "Stipends"],
  },
  {
    name: "Rent & Utilities",
    subcategories: ["Office rent", "Electricity", "Water", "Internet & phone"],
  },
  {
    name: "Software & Subscriptions",
    subcategories: ["Domain & SSL", "Licenses"],
  },
  {
    name: "Marketing & Advertising",
    subcategories: ["Paid ads", "Social media", "Content & design", "Events & sponsorships"],
  },
  {
    name: "Travel",
    subcategories: ["Flights", "Accommodation", "Local transport", "Meals (travel)"],
  },
  {
    name: "Office Supplies",
    subcategories: ["Stationery", "Furniture", "Pantry & groceries"],
  },
  {
    name: "Equipment & Hardware",
    subcategories: ["Laptops & computers", "Networking"],
  },
  {
    name: "Taxes & Government Fees",
    subcategories: ["GST", "Professional tax", "Registrations & filings"],
  },
  {
    name: "Banking & Finance Charges",
    subcategories: ["Bank charges", "Payment gateway fees", "Interest"],
  },
  {
    name: "Repairs & Maintenance",
    subcategories: ["Office maintenance", "Equipment repairs"],
  },
  {
    name: "Miscellaneous",
    subcategories: [],
  },
];

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    const now = new Date();

    // Map existing (non-deleted) category names → id so re-running never
    // duplicates and subcategories attach to the right parent.
    const existingCats = await sequelize.query(
      `SELECT id, name FROM expense_categories WHERE "deletedAt" IS NULL`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const catIdByName = new Map(existingCats.map((c) => [c.name, c.id]));

    const newCategories = [];
    for (const c of CATEGORIES) {
      if (catIdByName.has(c.name)) continue;
      const id = ulid();
      catIdByName.set(c.name, id);
      newCategories.push({
        id,
        name: c.name,
        type: "expense",
        is_active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (newCategories.length) {
      await queryInterface.bulkInsert("expense_categories", newCategories);
    }

    // Existing subcategories keyed by "<category_id>|<name>" for the same
    // insert-only-if-missing behaviour.
    const existingSubs = await sequelize.query(
      `SELECT category_id, name FROM expense_subcategories WHERE "deletedAt" IS NULL`,
      { type: sequelize.QueryTypes.SELECT }
    );
    const subSeen = new Set(existingSubs.map((s) => `${s.category_id}|${s.name}`));

    const newSubcategories = [];
    for (const c of CATEGORIES) {
      const categoryId = catIdByName.get(c.name);
      for (const subName of c.subcategories) {
        const key = `${categoryId}|${subName}`;
        if (subSeen.has(key)) continue;
        subSeen.add(key);
        newSubcategories.push({
          id: ulid(),
          category_id: categoryId,
          name: subName,
          is_active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    if (newSubcategories.length) {
      await queryInterface.bulkInsert("expense_subcategories", newSubcategories);
    }
  },

  async down(queryInterface) {
    const { sequelize, Sequelize } = queryInterface;
    const names = CATEGORIES.map((c) => c.name);

    // Remove the seeded subcategories first (FK), then the categories — only the
    // ones this seeder created, matched by name. Will fail if any have since
    // been referenced by an expense (intended: don't blow away real data).
    await sequelize.query(
      `DELETE FROM expense_subcategories
       WHERE category_id IN (SELECT id FROM expense_categories WHERE name IN (:names))`,
      { replacements: { names } }
    );
    await queryInterface.bulkDelete("expense_categories", {
      name: { [Sequelize.Op.in]: names },
    });
  },
};
