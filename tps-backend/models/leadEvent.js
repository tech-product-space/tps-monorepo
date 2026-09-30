"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const LeadEvent = sequelize.define(
    "LeadEvent",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      lead_source_type: { type: DataTypes.STRING, allowNull: false },
      lead_source_id: { type: DataTypes.STRING, allowNull: false },

      event_type: { type: DataTypes.STRING, allowNull: false },

      occurred_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      enrollment_id: DataTypes.STRING,
      workflow_node_run_id: DataTypes.STRING,
      provider_message_id: DataTypes.STRING,

      payload: { type: DataTypes.JSONB, defaultValue: {} },

      dedupe_key: DataTypes.STRING,
    },
    {
      tableName: "lead_events",
    }
  );

  return LeadEvent;
};
