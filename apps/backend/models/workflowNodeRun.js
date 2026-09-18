"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const WorkflowNodeRun = sequelize.define(
    "WorkflowNodeRun",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      enrollment_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      node_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      attempt: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      started_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },

      finished_at: DataTypes.DATE,

      output: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },

      provider_message_id: DataTypes.STRING,

      error: DataTypes.TEXT,
    },
    {
      tableName: "workflow_node_runs",
    }
  );

  WorkflowNodeRun.associate = (models) => {
    WorkflowNodeRun.belongsTo(models.WorkflowEnrollment, {
      foreignKey: "enrollment_id",
      as: "enrollment",
    });
  };

  return WorkflowNodeRun;
};
