import { DataTypes } from "sequelize";
import { ulid } from "ulid";

/**
 * The chip row on /recordings — "Data Analytics Fundamentals", "SQL",
 * "Excel & Spreadsheets", …
 *
 * A managed catalogue rather than a free-text column on `Recordings`, for the
 * same reasons `meta_sources` is one: the chips have a deliberate left-to-right
 * order, the selected chip belongs in the URL so it needs a stable slug, and
 * the set is curated — with free text one typo ("Powe BI") silently publishes
 * an extra chip.
 */
export default (sequelize) => {
  const RecordingCategory = sequelize.define(
    "RecordingCategory",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      /** Chip label — "Excel & Spreadsheets". */
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** Goes in the URL: `/recordings?category=excel-spreadsheets`. */
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      /** Left-to-right chip order. */
      order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      /**
       * Retires a chip without touching the recordings filed under it — they
       * stay reachable by direct URL and through "keep exploring", they just
       * leave the chip row.
       */
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      /** For a per-category heading / SEO later. Not rendered today. */
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "RecordingCategories",
      timestamps: true,
      hooks: {
        beforeValidate: (category) => {
          if (category.name && !category.slug) {
            category.slug = category.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
          }
        },
      },
    },
  );

  RecordingCategory.associate = (models) => {
    RecordingCategory.hasMany(models.Recording, {
      foreignKey: "categoryId",
      as: "recordings",
    });
  };

  return RecordingCategory;
};
