"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const WorkflowConditionWaiter = sequelize.define(
    "WorkflowConditionWaiter",
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
        unique: true,
      },

      node_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      event_type: {
        type: DataTypes.STRING,
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

      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: "workflow_condition_waiters",
    }
  );

  WorkflowConditionWaiter.associate = (models) => {
    WorkflowConditionWaiter.belongsTo(models.WorkflowEnrollment, {
      foreignKey: "enrollment_id",
      as: "enrollment",
    });
  };

  return WorkflowConditionWaiter;
};
