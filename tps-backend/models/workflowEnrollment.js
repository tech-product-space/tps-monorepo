"use strict";
const { ulid } = require("ulid");
const { ENROLLMENT_STATUS } = require("../constants/workflow");

module.exports = (sequelize, DataTypes) => {
  const WorkflowEnrollment = sequelize.define(
    "WorkflowEnrollment",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      workflow_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      workflow_version: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      lead_source_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      lead_source_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      lead_email_snapshot: DataTypes.STRING,

      lead_phone_snapshot: DataTypes.STRING,

      lead_name_snapshot: DataTypes.STRING,

      status: {
        type: DataTypes.STRING,
        defaultValue: ENROLLMENT_STATUS.ACTIVE,
      },

      current_node_id: DataTypes.STRING,

      context: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },

      next_scheduled_at: DataTypes.DATE,

      enrolled_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },

      completed_at: DataTypes.DATE,

      error_reason: DataTypes.TEXT,

      enrollment_source: DataTypes.STRING,
    },
    {
      tableName: "workflow_enrollments",
    }
  );

  WorkflowEnrollment.associate = (models) => {
    WorkflowEnrollment.belongsTo(models.Workflow, {
      foreignKey: "workflow_id",
      as: "workflow",
    });
    WorkflowEnrollment.hasMany(models.WorkflowNodeRun, {
      foreignKey: "enrollment_id",
      as: "nodeRuns",
    });
  };

  return WorkflowEnrollment;
};
