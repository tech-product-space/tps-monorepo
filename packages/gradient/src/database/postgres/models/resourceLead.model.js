import { DataTypes } from "sequelize";
import { ulid } from "ulid";
import { emitResourceDownloaded } from "../../../services/leadEvent/emitters.js";
import { emitTriggerEvent } from "../../../services/workflow/triggers/emitTriggerEvent.js";

export default (sequelize) => {
  const ResourceLead = sequelize.define(
    "ResourceLead",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      resourceId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      
      countryCode: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      jobTitle: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      additionalData: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
    },
    {
      tableName: "ResourceLeads",
      timestamps: true,
      /**
       * Lead-event emitter. Fires here rather than in the controllers because
       * this row has more than one create path, and a trigger that silently
       * stops firing for one of them reads as "quiet", not as a bug.
       * Deferred to after-commit inside the emitter, so a rolled-back write
       * records nothing. See `services/leadEvent/`.
       */
      hooks: {
        afterCreate: (row, options) => {
          emitResourceDownloaded(row, options);
          emitTriggerEvent("resourceLeads", row, options);
        },
        afterBulkCreate: (rows, options) => {
          for (const row of rows) {
            emitResourceDownloaded(row, options);
            emitTriggerEvent("resourceLeads", row, options);
          }
        },
      },
    },
  );

  ResourceLead.associate = (models) => {
    ResourceLead.belongsTo(models.Resource, {
      foreignKey: "resourceId",
      as: "resource",
    });
  };

  return ResourceLead;
};
