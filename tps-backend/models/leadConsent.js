"use strict";

const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const LeadConsent = sequelize.define(
    "LeadConsent",
    {
      // Surrogate PK introduced in the Phase-3 consolidation migration so
      // we can hold email-only rows (campaign unsubscribes whose source
      // row is unknown). Pre-migration rows get a deterministic id during
      // the migration's data-rewrite step.
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      // Lowercased email. Primary identity for cross-source matching.
      // Indexed in the 20260518 migration. Nullable only because legacy
      // pre-Phase-2 rows might not have it populated yet.
      email: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // Source-row context. Both nullable post-Phase-3 so we can store
      // email-only opt-outs. When both are set, a partial unique index
      // enforces single-row-per-source.
      lead_source_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      lead_source_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      opt_out_email: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      opt_out_whatsapp: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      opt_out_email_at: DataTypes.DATE,

      opt_out_whatsapp_at: DataTypes.DATE,

      opt_out_email_reason: DataTypes.STRING,

      opt_out_whatsapp_reason: DataTypes.STRING,
    },
    {
      tableName: "lead_consent",
    }
  );

  return LeadConsent;
};
