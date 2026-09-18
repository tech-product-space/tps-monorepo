"use strict";

/**
 * Converts `Recordings.content` from mixed shapes to HTML throughout.
 *
 * Both blocks are edited as rich text now, so both are stored as HTML strings:
 *
 * - `whatYouWillLearn` was `[{ title, description }]`. Each entry becomes an
 *   `<li>` with the title bold and the description on the next line, which is
 *   what the old two-field editor rendered anyway.
 * - `whyThisMatters` was plain text. Wrapped in `<p>` so it is valid markup
 *   rather than a bare text node the editor would re-wrap on first focus.
 *
 * Data-only — the column is already JSONB and its type does not change. Rows
 * whose blocks are absent, empty, or already HTML are left untouched, so this
 * is safe to re-run.
 *
 * Deliberately no `down`. Reversing it would mean parsing HTML back into
 * title/description pairs, and any list the admin has since written with a link
 * or a nested bullet has no faithful representation in the old shape. Losing
 * copy on a rollback is worse than a one-way migration.
 */

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const looksLikeHtml = (value) => /<[a-z][\s\S]*>/i.test(value);

const itemsToHtml = (items) => {
  const listItems = items
    .map((item) => {
      const title = item?.title ? `<strong>${escapeHtml(item.title)}</strong>` : "";
      const description = item?.description ? escapeHtml(item.description) : "";

      if (!title && !description) return "";

      return `<li>${title}${title && description ? "<br>" : ""}${description}</li>`;
    })
    .filter(Boolean)
    .join("");

  return listItems ? `<ul>${listItems}</ul>` : "";
};

const textToHtml = (text) => {
  const trimmed = String(text).trim();
  if (!trimmed) return "";
  if (looksLikeHtml(trimmed)) return trimmed;

  // Blank lines were the only paragraph break the old textarea offered.
  return trimmed
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
};

export default {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT id, content FROM "Recordings"',
    );

    let converted = 0;

    for (const row of rows) {
      const content = row.content ?? {};
      const next = { ...content };
      let changed = false;

      if (Array.isArray(content.whatYouWillLearn)) {
        next.whatYouWillLearn = itemsToHtml(content.whatYouWillLearn);
        changed = true;
      }

      if (
        typeof content.whyThisMatters === "string" &&
        content.whyThisMatters.trim() &&
        !looksLikeHtml(content.whyThisMatters)
      ) {
        next.whyThisMatters = textToHtml(content.whyThisMatters);
        changed = true;
      }

      if (!changed) continue;

      await queryInterface.sequelize.query(
        'UPDATE "Recordings" SET content = :content WHERE id = :id',
        { replacements: { content: JSON.stringify(next), id: row.id } },
      );

      converted += 1;
    }

    console.log(`[recordings] content converted to HTML on ${converted} row(s)`);
  },

  async down() {
    // See the note above: intentionally not reversible.
  },
};
