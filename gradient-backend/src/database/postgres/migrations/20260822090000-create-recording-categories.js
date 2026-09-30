"use strict";

/**
 * The chip row on /recordings.
 *
 * A managed catalogue rather than a free-text column on Recordings: the chips
 * carry a deliberate order, the selected one belongs in the URL so it needs a
 * stable slug, and the set is curated — free text means one typo publishes an
 * extra chip on the live site.
 *
 * Created before Recordings because that table's categoryId references it.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("RecordingCategories", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // The chip row's only query: active categories in display order.
    await queryInterface.addIndex("RecordingCategories", ["isActive", "order"], {
      name: "recording_categories_active_order",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("RecordingCategories");
  },
};
