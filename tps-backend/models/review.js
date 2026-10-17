"use strict";

const { ulid } = require("ulid");

/**
 * A testimonial on the website's /reviews page, managed from the admin.
 *
 * Image columns (`avatar`, `*_logo`) hold either an S3 key from
 * POST /upload/reviews (served via the assets domain) or a site-relative path
 * like "/assets/reviews/..." — the rows seeded from the page's old static JSON
 * still point at images in the website's public/ folder.
 *
 * The before/after columns are all optional; the website shows the transition
 * strip only when at least one side has something in it.
 */
module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define(
    "Review",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },
      name: { type: DataTypes.STRING, allowNull: false },
      role: { type: DataTypes.STRING, allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: false },
      linkedin_url: { type: DataTypes.STRING(500), allowNull: true },
      avatar: { type: DataTypes.STRING(500), allowNull: true },
      before_company: { type: DataTypes.STRING, allowNull: true },
      before_designation: { type: DataTypes.STRING, allowNull: true },
      before_logo: { type: DataTypes.STRING(500), allowNull: true },
      after_company: { type: DataTypes.STRING, allowNull: true },
      after_designation: { type: DataTypes.STRING, allowNull: true },
      after_logo: { type: DataTypes.STRING(500), allowNull: true },
      youtube_url: { type: DataTypes.STRING(500), allowNull: true },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "draft" },
      display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      published_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "reviews", timestamps: true }
  );

  return Review;
};
