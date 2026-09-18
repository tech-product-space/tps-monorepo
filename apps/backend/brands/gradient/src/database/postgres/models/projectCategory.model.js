import { DataTypes } from "sequelize";
import { ulid } from "ulid";

/**
 * The tile grid on /projects — "Python", "React", "Machine Learning", …
 *
 * A managed catalogue rather than a free-text column on `Projects`, for the
 * same reasons `RecordingCategories` and `meta_sources` are: the tiles carry a
 * deliberate order, the selected one belongs in the URL so it needs a stable
 * slug, and the set is curated — with free text one typo ("Pyhton") silently
 * publishes an extra tile on the live site.
 */
export default (sequelize) => {
  const ProjectCategory = sequelize.define(
    "ProjectCategory",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      /** Tile label — "Machine Learning". */
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      /** Goes in the URL: `/projects/machine-learning`. */
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      /**
       * **The whole tile**, as an S3 key — not a URL, and not a logo.
       *
       * The category's name, its sub-label and its arrow are all baked into the
       * artwork, so the site renders this image and nothing else; see
       * `ProjectCategories.tsx`. 16:9, and the admin's uploader warns when an
       * upload is not. Public URLs are built from `AWS_FILE_BASE_URL` by
       * `resolveStorageUrl` in both frontends, so storing a full URL here would
       * hardcode today's CDN.
       */
      thumbnail: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Tile order, left to right and top to bottom. */
      order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      /**
       * Retires a tile without touching the projects filed under it — they stay
       * reachable by direct URL and through "more like this", they just leave
       * the grid.
       */
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      /**
       * The per-category page's sub-heading — "Free python projects you can
       * complete on your own and flaunt in your dev portfolio".
       *
       * Unlike `RecordingCategory.description`, this one renders.
       */
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "ProjectCategories",
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

  ProjectCategory.associate = (models) => {
    ProjectCategory.hasMany(models.Project, {
      foreignKey: "categoryId",
      as: "projects",
    });
  };

  return ProjectCategory;
};
