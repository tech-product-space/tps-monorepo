/**
 * Backfill: recompute every blog's `tableOfContents` from its stored Tiptap
 * content, so posts written before the H2/H3 split pick up the new structure
 * without anyone having to re-save them in the admin panel.
 *
 * The rule mirrors the editor exactly (gradient-admin TiptapEditor.tsx):
 * H2 -> a level-2 main entry, H3 -> a level-3 sub-entry, headings with no text
 * are skipped, H1 is excluded. If that filter changes there, change TOC_LEVELS
 * here too — the two must agree or a re-save will disagree with this backfill.
 *
 * It also repairs anchors while it is in there. The Tiptap TOC plugin keys off
 * `data-toc-id`, not `id`, so a heading carrying an `id` but no `data-toc-id`
 * is handed a brand new uuid the moment someone opens the editor — silently
 * breaking every link in the stored TOC. We copy the existing `id` into
 * `data-toc-id` and mint a uuid only where there is no id at all, which both
 * preserves live anchors and stops the content tab going dirty on open.
 *
 *   node src/scripts/backfill-blog-toc.js            # dry run, reports only
 *   node src/scripts/backfill-blog-toc.js --verbose  # dry run, lists every blog
 *   node src/scripts/backfill-blog-toc.js --confirm --backup toc-backup.json
 *
 * --backup writes the pre-change content and tableOfContents of every blog it
 * is about to touch. Since this rewrites the content JSONB, use it on anything
 * that is not a throwaway database; restoring is a plain loop over the file.
 */

import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import db from "../database/postgres/models/index.js";

const { Blog, sequelize } = db;

const CONFIRM = process.argv.includes("--confirm");
const VERBOSE = process.argv.includes("--verbose");

const backupIndex = process.argv.indexOf("--backup");
const BACKUP_PATH = backupIndex === -1 ? null : process.argv[backupIndex + 1];

// Heading levels that belong in the table of contents.
const TOC_LEVELS = [2, 3];

/** Concatenated text of a node's descendants — Tiptap's `node.textContent`. */
function textContentOf(node) {
  if (!node || typeof node !== "object") return "";
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(textContentOf).join("");
}

/** Every heading node in document order, however deeply nested. */
function headingsOf(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.type === "heading") out.push(node);
  if (Array.isArray(node.content)) {
    for (const child of node.content) headingsOf(child, out);
  }
  return out;
}

/**
 * Mutates `content` in place to repair heading ids and returns the TOC that
 * the editor would produce for it.
 */
function rebuild(content) {
  const seen = new Set();
  const toc = [];
  const levels = {};
  let idsRepaired = 0;

  for (const node of headingsOf(content)) {
    const attrs = node.attrs || (node.attrs = {});
    const level = attrs.level ?? 1;
    const text = textContentOf(node);

    levels[level] = (levels[level] || 0) + 1;

    // The plugin ignores empty headings entirely — no id, no entry.
    if (text.length === 0) continue;

    // Prefer the existing `id`: it is what the public page renders as the
    // anchor and what any already-stored TOC entry points at.
    let id = attrs.id || attrs["data-toc-id"];
    if (!id || seen.has(id)) id = randomUUID();

    if (attrs.id !== id || attrs["data-toc-id"] !== id) {
      attrs.id = id;
      attrs["data-toc-id"] = id;
      idsRepaired += 1;
    }
    seen.add(id);

    if (TOC_LEVELS.includes(level)) {
      toc.push({ id, level, textContent: text });
    }
  }

  return { toc, levels, idsRepaired };
}

const isDoc = (c) => c?.type === "doc" && Array.isArray(c.content);
const describeLevels = (levels) =>
  Object.keys(levels)
    .sort()
    .map((l) => `${levels[l]}×H${l}`)
    .join(" ") || "no headings";

async function main() {
  const blogs = await Blog.findAll({
    attributes: ["id", "title", "url", "status", "content", "tableOfContents"],
    order: [["createdAt", "ASC"]],
  });

  console.log(`Blogs found: ${blogs.length}\n`);

  const changed = [];
  const emptied = [];
  let skippedNoContent = 0;
  let unchanged = 0;
  let idsRepaired = 0;

  for (const blog of blogs) {
    if (!isDoc(blog.content)) {
      skippedNoContent += 1;
      continue;
    }

    const content = structuredClone(blog.content);
    const result = rebuild(content);
    const before = blog.tableOfContents || [];

    const tocChanged =
      JSON.stringify(before) !== JSON.stringify(result.toc);
    const contentChanged = result.idsRepaired > 0;

    if (!tocChanged && !contentChanged) {
      unchanged += 1;
      continue;
    }

    idsRepaired += result.idsRepaired;
    const row = {
      blog,
      content,
      toc: result.toc,
      levels: result.levels,
      beforeCount: before.length,
      contentChanged,
    };
    changed.push(row);

    // The case worth eyeballing: had a TOC, would end up with none.
    if (before.length > 0 && result.toc.length === 0) emptied.push(row);
  }

  if (VERBOSE) {
    for (const row of changed) {
      const mains = row.toc.filter((i) => i.level === 2).length;
      const subs = row.toc.length - mains;
      console.log(
        `  ${row.blog.title}\n` +
          `    headings: ${describeLevels(row.levels)}\n` +
          `    toc: ${row.beforeCount} entries -> ${row.toc.length} ` +
          `(${mains} main, ${subs} sub)` +
          (row.contentChanged ? "  [heading ids repaired]" : "")
      );
    }
    if (changed.length) console.log("");
  }

  console.log(`Unchanged:            ${unchanged}`);
  console.log(`No usable content:    ${skippedNoContent}`);
  console.log(`Would update:         ${changed.length}`);
  console.log(`Heading ids repaired: ${idsRepaired}`);

  if (emptied.length) {
    console.log(
      `\n⚠  ${emptied.length} blog(s) would lose their TOC entirely — ` +
        `their sections are not H2/H3:`
    );
    for (const row of emptied) {
      console.log(
        `   - ${row.blog.title}  (/${row.blog.url}, ${row.blog.status})  ` +
          `${describeLevels(row.levels)}`
      );
    }
    console.log(
      `   Fix the headings in the editor, or widen TOC_LEVELS in this script ` +
        `and the matching filter in gradient-admin TiptapEditor.tsx.`
    );
  }

  if (changed.length === 0) {
    console.log("\nNothing to backfill.");
    return;
  }

  if (!CONFIRM) {
    console.log("\nDRY RUN — nothing changed. Re-run with --confirm to apply.");
    return;
  }

  if (BACKUP_PATH) {
    writeFileSync(
      BACKUP_PATH,
      JSON.stringify(
        changed.map((row) => ({
          id: row.blog.id,
          title: row.blog.title,
          content: row.blog.content,
          tableOfContents: row.blog.tableOfContents,
        })),
        null,
        2
      )
    );
    console.log(`\nBacked up ${changed.length} blog(s) to ${BACKUP_PATH}`);
  } else {
    console.log(
      "\nNo --backup given — the content column is being rewritten without one."
    );
  }

  let written = 0;
  for (const row of changed) {
    await Blog.update(
      { content: row.content, tableOfContents: row.toc },
      { where: { id: row.blog.id }, silent: true } // keep updatedAt honest
    );
    written += 1;
  }

  console.log(`\n✅ Rebuilt the table of contents on ${written} blog(s).`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
