"use strict";

/**
 * Drops `Recordings.description`.
 *
 * It was carried as "SEO fallback", but neither page renders it and `seo` is a
 * column of its own — so it was a field an admin had to fill for nothing, and
 * the public search matched text nobody could read. Title and subtitle are what
 * the pages show and what search now covers.
 *
 * A separate migration rather than an edit to the create: the feature shipped
 * this morning and there is already a real recording in the dev database.
 * Rewriting history would mean dropping and re-creating the table under it.
 *
 * The column is nullable and every existing row has it null, so nothing is
 * lost. `down` restores the column, not its contents — one-way by nature.
 */
export default {
  async up(queryInterface) {
    await queryInterface.removeColumn("Recordings", "description");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Recordings", "description", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },
};
