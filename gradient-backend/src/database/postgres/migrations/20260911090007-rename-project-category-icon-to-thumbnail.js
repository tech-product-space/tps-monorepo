"use strict";

/**
 * `icon` → `thumbnail`.
 *
 * The column was specified as a small logo sitting beside a name the tile drew
 * itself. The tile is now a single uploaded image that carries the name, the
 * sub-label and the arrow baked into the artwork, so "icon" names the wrong
 * thing — and a column whose name disagrees with its contents is how the next
 * person ships a 64px logo into a 16:9 slot.
 *
 * A rename, not a new column: the feature has not shipped, so there is nothing
 * to migrate between the two.
 */
export default {
  async up(queryInterface) {
    await queryInterface.renameColumn("ProjectCategories", "icon", "thumbnail");
  },

  async down(queryInterface) {
    await queryInterface.renameColumn("ProjectCategories", "thumbnail", "icon");
  },
};
