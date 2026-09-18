import { LEAD_STATUS } from "../../../config/constants/lead.js";
import { ulid } from "ulid";
import { emitLeadCreated } from "../../../services/leadEvent/emitters.js";
import { emitTriggerEvent } from "../../../services/workflow/triggers/emitTriggerEvent.js";

export default (sequelize, DataTypes) => {
  const Lead = sequelize.define(
    "Lead",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: true,
        },
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      countryCode: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      source: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      sourceDisplayName: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      subSource: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      subSourceDisplayName: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      status: {
        type: DataTypes.STRING,
        defaultValue: LEAD_STATUS.NEW,
        validate: {
          isIn: [Object.values(LEAD_STATUS)],
        },
      },

      pageUrl: {
        type: DataTypes.STRING,
      },

      referrer: {
        type: DataTypes.STRING,
      },

      utmId: {
        type: DataTypes.STRING,
      },

      utmSource: {
        type: DataTypes.STRING,
      },

      utmMedium: {
        type: DataTypes.STRING,
      },

      utmCampaign: {
        type: DataTypes.STRING,
      },

      utmTerm: {
        type: DataTypes.STRING,
      },

      utmContent: {
        type: DataTypes.STRING,
      },

      additionalData: {
        type: DataTypes.JSONB,
      },

      /** Set only for leads raised from a paid course page. */
      courseId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "leads",
      timestamps: true,
      /**
       * Lead-event emitter. Fires here rather than in the controllers because
       * this row has more than one create path, and a trigger that silently
       * stops firing for one of them reads as "quiet", not as a bug.
       * Deferred to after-commit inside the emitter, so a rolled-back write
       * records nothing. See `services/leadEvent/`.
       */
      hooks: {
        afterCreate: (lead, options) => {
          emitLeadCreated(lead, options);
          emitTriggerEvent("leads", lead, options);
        },
        afterBulkCreate: (leads, options) => {
          for (const lead of leads) {
            emitLeadCreated(lead, options);
            emitTriggerEvent("leads", lead, options);
          }
        },
      },
    },
  );

  Lead.associate = (models) => {
    Lead.belongsTo(models.Course, {
      foreignKey: "courseId",
      as: "course",
    });
  };

  return Lead;
};
