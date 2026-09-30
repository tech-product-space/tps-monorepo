"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Recordings", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      subtitle: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      categoryId: {
        type: Sequelize.STRING,
        allowNull: true,
        references: { model: "RecordingCategories", key: "id" },
        onUpdate: "CASCADE",
        // Losing a shelf label must never delete what is on the shelf.
        onDelete: "SET NULL",
      },
      thumbnail: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      video: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      durationMinutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      host: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      speakers: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
      },
      content: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      relatedRecordingIds: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: [],
      },
      attendeeCount: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      viewCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      seo: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      format: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      isPublished: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      publishedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      scheduledAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // The unfiltered public grid.
    await queryInterface.sequelize.query(
      `CREATE INDEX "recordings_published_published_at"
         ON "Recordings" ("isPublished", "publishedAt" DESC)`
    );

    // The chip-filtered grid.
    await queryInterface.sequelize.query(
      `CREATE INDEX "recordings_category_published_published_at"
         ON "Recordings" ("categoryId", "isPublished", "publishedAt" DESC)`
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Recordings");
  },
};
