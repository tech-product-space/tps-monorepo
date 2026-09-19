"use strict";

/**
 * The cached lead-form list, and the routing table.
 *
 * This is the whole optimisation: the poll reads its form list from here, not
 * from Graph. `/leadgen_forms` is called only by an explicit sync — the button
 * or the hourly job — so the every-five-minutes path is one request per form
 * and nothing else.
 *
 * Sync refreshes `name`, `status` and `lastSeenAt` only. It must never touch
 * the mapping columns, or an admin's routing would be silently reverted by a
 * background job.
 *
 * See `../FACEBOOK_LEADS_PLAN.md` §4.2.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_forms", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      accountId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "meta_accounts", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },

      /** Facebook's form id. */
      formId: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      /** Facebook's own status — ACTIVE / ARCHIVED / DELETED. */
      status: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },

      /**
       * Per-form routing, picked from the `meta_sources` catalogue rather than
       * typed. Null falls back to the account default.
       *
       * SET NULL on delete: removing a source must un-map the forms that used
       * it — loudly, via the panel's "not mapped" warning — rather than leave
       * them pointing at a row that no longer exists.
       */
      sourceId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "meta_sources", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      subSourceId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "meta_sources", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      courseId: { type: Sequelize.STRING, allowNull: true },

      /** Unchecked → the poll skips this form entirely. */
      active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      leadCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      /**
       * Last sync that still saw this form on the Page. A form deleted in Meta
       * keeps its row and stops advancing this — history stays attributable
       * rather than disappearing along with the form.
       */
      lastSeenAt: { type: Sequelize.DATE, allowNull: true },

      // ── Backfill progress, written by the backfill job ──────────────────
      backfillStatus: { type: Sequelize.STRING(20), allowNull: true },
      backfillTotal: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      backfillInserted: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      backfillAlreadyImported: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      backfillSkipped: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      backfillSince: { type: Sequelize.DATE, allowNull: true },
      backfillStartedAt: { type: Sequelize.DATE, allowNull: true },
      backfillFinishedAt: { type: Sequelize.DATE, allowNull: true },
      /** Also carries a warning on success — "N leads could not be imported". */
      backfillError: { type: Sequelize.TEXT, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("meta_forms", ["accountId", "formId"], {
      name: "uq_meta_forms_account_form",
      unique: true,
    });

    // The poll's own lookup: every active form for an enabled account.
    await queryInterface.addIndex("meta_forms", ["accountId", "active"], {
      name: "idx_meta_forms_account_active",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_forms");
  },
};
