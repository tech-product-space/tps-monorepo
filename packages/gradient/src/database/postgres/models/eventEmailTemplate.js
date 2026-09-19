import { DataTypes } from "sequelize";
import { ulid } from "ulid";

export default (sequelize) => {
  const EventEmailTemplate = sequelize.define(
    "EventEmailTemplate",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      eventId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      subject: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      tableName: "EventEmailTemplates",
      timestamps: true,
    },
  );

  EventEmailTemplate.associate = (models) => {
    EventEmailTemplate.belongsTo(models.Event, {
      foreignKey: "eventId",
      as: "event",
    });
  };

  return EventEmailTemplate;
};
