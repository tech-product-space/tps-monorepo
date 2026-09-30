import { DataTypes } from "sequelize";
import { ulid } from "ulid";

export default (sequelize) => {
  const FreeCourseCertificateTemplate = sequelize.define(
    "FreeCourseCertificateTemplate",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      freeCourseId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      // S3 key. Render it in a browser with resolveStorageUrl(key).
      backgroundKey: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      canvasWidth: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      canvasHeight: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      // "landscape" | "portrait" — decides the printed page size, not the
      // artwork. Not null: unlike the event table there are no pre-existing
      // rows to backfill, so the renderer's guess-from-aspect-ratio fallback is
      // one this table never has to rely on.
      orientation: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      // x/y are percentages of the canvas, not pixels — that is what lets the
      // admin editor position on a scaled preview and still match the render.
      fields: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },

      createdBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      updatedBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "FreeCourseCertificateTemplates",
      timestamps: true,
    },
  );

  FreeCourseCertificateTemplate.associate = (models) => {
    FreeCourseCertificateTemplate.belongsTo(models.FreeCourse, {
      foreignKey: "freeCourseId",
      as: "course",
    });

    FreeCourseCertificateTemplate.belongsTo(models.AdminUser, {
      foreignKey: "createdBy",
      as: "createdAdmin",
    });

    FreeCourseCertificateTemplate.belongsTo(models.AdminUser, {
      foreignKey: "updatedBy",
      as: "updatedAdmin",
    });
  };

  return FreeCourseCertificateTemplate;
};
