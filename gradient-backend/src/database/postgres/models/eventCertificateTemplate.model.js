import { DataTypes } from "sequelize";
import { ulid } from "ulid";

export default (sequelize) => {
  const EventCertificateTemplate = sequelize.define(
    "EventCertificateTemplate",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      eventId: {
        type: DataTypes.STRING,
        allowNull: false,
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
      // artwork. Nullable because templates predate it; the renderer falls back
      // to the shape of the canvas.
      orientation: {
        type: DataTypes.STRING,
        allowNull: true,
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
      tableName: "EventCertificateTemplates",
      timestamps: true,
    },
  );

  EventCertificateTemplate.associate = (models) => {
    EventCertificateTemplate.belongsTo(models.Event, {
      foreignKey: "eventId",
      as: "event",
    });

    EventCertificateTemplate.belongsTo(models.AdminUser, {
      foreignKey: "createdBy",
      as: "createdAdmin",
    });

    EventCertificateTemplate.belongsTo(models.AdminUser, {
      foreignKey: "updatedBy",
      as: "updatedAdmin",
    });
  };

  return EventCertificateTemplate;
};
