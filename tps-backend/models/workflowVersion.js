"use strict";

module.exports = (sequelize, DataTypes) => {
  const WorkflowVersion = sequelize.define(
    "WorkflowVersion",
    {
      workflow_id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },

      version: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },

      definition: {
        type: DataTypes.JSONB,
        allowNull: false,
      },

      published_by: DataTypes.STRING,

      published_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "workflow_versions",
    }
  );

  WorkflowVersion.associate = (models) => {
    WorkflowVersion.belongsTo(models.Workflow, {
      foreignKey: "workflow_id",
      as: "workflow",
    });
  };

  return WorkflowVersion;
};
