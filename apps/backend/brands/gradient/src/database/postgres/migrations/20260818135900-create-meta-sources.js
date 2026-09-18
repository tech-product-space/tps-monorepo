"use strict";

/**
 * The managed source / sub source catalogue.
 *
 * Replaces free-text routing fields on `meta_forms`. Typed-in taxonomy is how a
 * database ends up holding `facebook`, `Facebook`, `facebook ` and `fb` as four
 * distinct sources that no filter can reconcile — and because routing is frozen
 * onto each lead at import, a typo is permanent for every lead that arrived
 * under it.
 *
 * A two-level tree in one table rather than two near-identical tables:
 * `parentId IS NULL` is a source, `parentId` set is a sub source of it. One
 * CRUD screen, one endpoint set, and sub sources are scoped to their parent so
 * the panel can cascade the two selects.
 *
 * `key` is what gets written to `meta_leads.source` / `.subSource`;
 * `displayName` is what humans read. Leads store both, frozen — this table can
 * be renamed later without rewriting history.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("meta_sources", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      /**
       * Slug written onto the lead. Lowercased and trimmed on write, because
       * the whole point of this table is that one concept has one spelling.
       */
      key: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      displayName: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      /** Null = a source. Set = a sub source belonging to that source. */
      parentId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "meta_sources", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },

      /**
       * Retired rather than deleted.
       *
       * Deleting a source that leads already reference does not corrupt them —
       * they hold their own frozen copy — but it does remove the label the
       * filter dropdown needs. Inactive hides it from the pickers while leaving
       * historical rows readable.
       */
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    /**
     * Two partial indexes, not one composite.
     *
     * Postgres treats NULLs as distinct in a unique index, so a plain
     * UNIQUE(parentId, key) would happily accept two top-level sources both
     * called `facebook` — exactly the duplication this table exists to stop.
     */
    await queryInterface.addIndex("meta_sources", ["key"], {
      name: "uq_meta_sources_root_key",
      unique: true,
      where: { parentId: null },
    });

    await queryInterface.addIndex("meta_sources", ["parentId", "key"], {
      name: "uq_meta_sources_child_key",
      unique: true,
      where: { parentId: { [Sequelize.Op.ne]: null } },
    });

    // The picker's read: active children of one parent.
    await queryInterface.addIndex("meta_sources", ["parentId", "isActive"], {
      name: "idx_meta_sources_parent_active",
    });

    // Seed the one source every Facebook lead falls back to, so a fresh install
    // can map a form before anyone has opened the catalogue screen.
    const now = new Date();

    await queryInterface.bulkInsert("meta_sources", [
      {
        id: "01JMETASOURCEFACEBOOK0000",
        key: "facebook",
        displayName: "Facebook",
        parentId: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("meta_sources");
  },
};
