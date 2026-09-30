"use strict";

/**
 * Which editor wrote a lesson's `content`, and therefore which renderer can read
 * it back.
 *
 *  1 — the block builder: `{ blocks: [...] }`
 *  2 — the Tiptap editor: `{ doc: { type: "doc", ... } }`
 *
 * Defaults to 1 so every row that already exists keeps rendering through the
 * block renderer untouched; the admin panel stamps 2 on everything it creates
 * from here on. Mirrors `blogs.version`, which splits the blog editor the same
 * way.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("course_module_lessons", "content_version", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "course_module_lessons",
      "content_version",
    );
  },
};
