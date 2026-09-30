"use strict";

import { ulid } from "ulid";

/**
 * Moves `meta_accounts` and `meta_forms` from free-text routing onto the
 * `meta_sources` catalogue.
 *
 * Why this exists at all: those two tables were created before the catalogue
 * was designed, and the create-table migrations were later rewritten in place
 * to the id-based shape. Any database that had already run them kept the string
 * columns, and `SequelizeMeta` will never replay a migration it has recorded —
 * so the model expects `defaultSourceId` while the table still has
 * `defaultSource`. This migration is the reconciliation.
 *
 * It is deliberately conditional. A database created from scratch runs the
 * (id-shaped) create-table migrations and arrives here with nothing to do; a
 * drifted database arrives here with the string columns and gets converted.
 * Both end up at the same schema, which is the only property that matters.
 */

/** The four string columns each table carried, and what replaces them. */
const TABLES = [
  {
    table: "meta_accounts",
    key: "defaultSource",
    subKey: "defaultSubSource",
    label: "defaultSourceDisplayName",
    subLabel: "defaultSubSourceDisplayName",
    idCol: "defaultSourceId",
    subIdCol: "defaultSubSourceId",
  },
  {
    table: "meta_forms",
    key: "source",
    subKey: "subSource",
    label: "sourceDisplayName",
    subLabel: "subSourceDisplayName",
    idCol: "sourceId",
    subIdCol: "subSourceId",
  },
];

/** Matches the normalisation the source service applies on write. */
const toKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default {
  async up(queryInterface, Sequelize) {
    const { sequelize } = queryInterface;
    const select = (sql, transaction) =>
      sequelize.query(sql, {
        type: Sequelize.QueryTypes.SELECT,
        transaction,
      });

    await sequelize.transaction(async (transaction) => {
      // The catalogue, loaded once and kept in step as we create rows.
      const catalogue = await select(
        `SELECT id, key, "parentId" FROM meta_sources`,
        transaction,
      );

      const cacheKey = (key, parentId) => `${parentId || "~root~"}::${key}`;
      const cache = new Map(
        catalogue.map((row) => [cacheKey(row.key, row.parentId), row.id]),
      );

      /** Finds a catalogue entry by key, creating it if this is its first use. */
      const ensureSource = async (rawKey, displayName, parentId) => {
        const key = toKey(rawKey);
        if (!key) return null;

        const hit = cache.get(cacheKey(key, parentId));
        if (hit) return hit;

        const id = ulid();
        const now = new Date();

        await queryInterface.bulkInsert(
          "meta_sources",
          [
            {
              id,
              key,
              // Falls back to the key so the catalogue screen never shows a
              // blank row, even for a value typed before labels were required.
              displayName: String(displayName || rawKey || key).trim() || key,
              parentId: parentId || null,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            },
          ],
          { transaction },
        );

        cache.set(cacheKey(key, parentId), id);
        return id;
      };

      for (const spec of TABLES) {
        const columns = await queryInterface.describeTable(spec.table, {
          transaction,
        });

        // Already id-shaped — a fresh database. Nothing to reconcile.
        if (!columns[spec.key]) continue;

        for (const column of [spec.idCol, spec.subIdCol]) {
          if (columns[column]) continue;

          await queryInterface.addColumn(
            spec.table,
            column,
            {
              type: Sequelize.STRING,
              allowNull: true,
              references: { model: "meta_sources", key: "id" },
              onDelete: "SET NULL",
              onUpdate: "CASCADE",
            },
            { transaction },
          );
        }

        const rows = await select(
          `SELECT id, "${spec.key}" AS k, "${spec.subKey}" AS sk,
                  "${spec.label}" AS l, "${spec.subLabel}" AS sl
             FROM "${spec.table}"
            WHERE "${spec.key}" IS NOT NULL OR "${spec.subKey}" IS NOT NULL`,
          transaction,
        );

        for (const row of rows) {
          // A sub source has to hang off something. If a row somehow carried
          // one with no source, `facebook` is the only honest parent — these
          // are Facebook pages — and it is already seeded.
          const sourceId = await ensureSource(row.k || "facebook", row.l, null);
          const subSourceId = row.sk
            ? await ensureSource(row.sk, row.sl, sourceId)
            : null;

          await sequelize.query(
            `UPDATE "${spec.table}"
                SET "${spec.idCol}" = :sourceId,
                    "${spec.subIdCol}" = :subSourceId
              WHERE id = :id`,
            {
              replacements: { sourceId, subSourceId, id: row.id },
              transaction,
            },
          );
        }

        for (const column of [
          spec.key,
          spec.subKey,
          spec.label,
          spec.subLabel,
        ]) {
          await queryInterface.removeColumn(spec.table, column, { transaction });
        }
      }
    });
  },

  /**
   * Intentionally a no-op.
   *
   * There is no safe symmetric revert. On a drifted database this migration
   * converted the columns; on a fresh one it did nothing — and nothing here
   * records which happened. A down() that unconditionally recreated the string
   * columns would therefore *introduce* the drift on a fresh database rather
   * than undo it.
   *
   * Rolling back past this point means rolling back the meta feature, and the
   * create-table migrations already drop these tables outright.
   */
  async down() {},
};
