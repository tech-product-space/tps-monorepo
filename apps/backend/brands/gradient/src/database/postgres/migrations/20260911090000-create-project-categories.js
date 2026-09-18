"use strict";

/**
 * The tile grid on /projects.
 *
 * A managed catalogue rather than a free-text column on Projects: the tiles
 * carry a deliberate order, the selected one belongs in the URL so it needs a
 * stable slug, and the set is curated — free text means one typo publishes an
 * extra tile on the live site.
 *
 * Created before Projects, because that table's categoryId references it.
 */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ProjectCategories", {
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

      // An S3 key, not a URL — public URLs are built from AWS_FILE_BASE_URL.
      icon: {
        type: Sequelize.STRING,
        allowNull: true,
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

    // The grid's only query: active categories in display order.
    await queryInterface.addIndex("ProjectCategories", ["isActive", "order"], {
      name: "project_categories_active_order",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ProjectCategories");
  },
};
