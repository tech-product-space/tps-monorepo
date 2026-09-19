import { ulid } from "ulid";

import {
  META_IMPORT_SOURCE,
  META_LEAD_STATUS,
  META_SKIP_REASON,
} from "../../../config/constants/metaLead.js";
import { emitMetaLeadCreated } from "../../../services/leadEvent/emitters.js";
import { emitTriggerEvent } from "../../../services/workflow/triggers/emitTriggerEvent.js";

/**
 * A lead from a Facebook Lead Ad form.
 *
 * Deliberately its own table rather than a row in `leads` — the two pipelines
 * are independent by decision (`FACEBOOK_LEADS_PLAN.md` §2). The cost of that
 * is everything downstream has to be wired explicitly, starting with the hook
 * at the bottom of this file.
 */
export default (sequelize, DataTypes) => {
  const MetaLead = sequelize.define(
    "MetaLead",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      /** Facebook's lead id. Unique — see the migration for why it matters. */
      metaLeadId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      accountId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      formId: { type: DataTypes.STRING, allowNull: false },
      pageId: { type: DataTypes.STRING, allowNull: false },
      formName: { type: DataTypes.STRING, allowNull: true },

      name: { type: DataTypes.STRING, allowNull: true },

      /**
       * No `isEmail` validator, on purpose.
       *
       * `leads` has one, and it is right there: a website form we control
       * should not accept nonsense. Here the input is a third party's payload
       * and the row is the only record of it — a validator would turn one
       * malformed answer into a lost lead. Shape checking happens in
       * `normalizeMetaLeadFields`, which demotes a bad address to
       * `fields.email_raw` instead of rejecting anything.
       */
      email: { type: DataTypes.STRING, allowNull: true },

      phone: { type: DataTypes.STRING, allowNull: true },
      countryCode: { type: DataTypes.STRING, allowNull: true },

      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: META_LEAD_STATUS.NEW,
        validate: {
          isIn: [Object.values(META_LEAD_STATUS)],
        },
      },

      /** Frozen at import — see the migration's note on why not a join. */
      source: { type: DataTypes.STRING, allowNull: true },
      subSource: { type: DataTypes.STRING, allowNull: true },
      sourceDisplayName: { type: DataTypes.STRING, allowNull: true },
      subSourceDisplayName: { type: DataTypes.STRING, allowNull: true },
      courseId: { type: DataTypes.STRING, allowNull: true },

      campaignId: { type: DataTypes.STRING, allowNull: true },
      campaignName: { type: DataTypes.STRING, allowNull: true },
      adsetId: { type: DataTypes.STRING, allowNull: true },
      adsetName: { type: DataTypes.STRING, allowNull: true },
      adId: { type: DataTypes.STRING, allowNull: true },
      adName: { type: DataTypes.STRING, allowNull: true },

      fields: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      rawPayload: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      /** Facebook's timestamp. The list sorts on this, not on `createdAt`. */
      sourceCreatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },

      importedVia: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: META_IMPORT_SOURCE.POLL,
        validate: {
          isIn: [Object.values(META_IMPORT_SOURCE)],
        },
      },

      skipReason: {
        type: DataTypes.STRING(30),
        allowNull: true,
        validate: {
          isIn: [[...Object.values(META_SKIP_REASON), null]],
        },
      },
    },
    {
      tableName: "meta_leads",
      timestamps: true,
      /**
       * Lead-event emitter.
       *
       * On the model rather than in the ingestion service for the same reason
       * `Lead` does it: there is more than one insert path — the poll and the
       * backfill — and a trigger that silently stops firing for one of them
       * reads as quiet, not as a bug.
       *
       * The emitter defers to after-commit and swallows its own failures, so a
       * timeline write can neither delay nor fail an import.
       */
      hooks: {
        afterCreate: (metaLead, options) => {
          emitMetaLeadCreated(metaLead, options);
          emitTriggerEvent("metaLeads", metaLead, options);
        },
        afterBulkCreate: (metaLeads, options) => {
          for (const metaLead of metaLeads) {
            emitMetaLeadCreated(metaLead, options);
            emitTriggerEvent("metaLeads", metaLead, options);
          }
        },
      },
    },
  );

  MetaLead.associate = (models) => {
    MetaLead.belongsTo(models.MetaAccount, {
      foreignKey: "accountId",
      as: "account",
    });

    MetaLead.belongsTo(models.Course, {
      foreignKey: "courseId",
      as: "course",
      constraints: false,
    });
  };

  return MetaLead;
};
