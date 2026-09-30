"use strict";
const { ulid } = require("ulid");
const { WORKFLOW_STATUS } = require("../constants/workflow");

module.exports = (sequelize, DataTypes) => {
  const Workflow = sequelize.define(
    "Workflow",
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

      description: DataTypes.TEXT,

      status: {
        type: DataTypes.STRING,
        defaultValue: WORKFLOW_STATUS.DRAFT,
      },

      current_version: DataTypes.INTEGER,

      trigger_config: {
        type: DataTypes.JSONB,
      },

      settings: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },

      draft_definition: {
        type: DataTypes.JSONB,
      },

      created_by: DataTypes.STRING,

      published_at: DataTypes.DATE,
    },
    {
      tableName: "workflows",
    }
  );

  Workflow.associate = (models) => {
    Workflow.hasMany(models.WorkflowVersion, {
      foreignKey: "workflow_id",
      as: "versions",
    });
    Workflow.hasMany(models.WorkflowEnrollment, {
      foreignKey: "workflow_id",
      as: "enrollments",
    });
  };

  return Workflow;
};
