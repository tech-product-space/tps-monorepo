"use strict";

module.exports = (sequelize, DataTypes) => {
  const WorkflowGlobalSetting = sequelize.define(
    "WorkflowGlobalSetting",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      // How many workflows a single lead can be ACTIVELY enrolled in at the
      // same time, counted across the whole system. Default 1 means a lead
      // who is already in workflow A will be skipped when workflow B tries
      // to enroll them, until A completes/fails/is cancelled.
      max_active_workflows_per_lead: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      updated_by: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "workflow_global_settings",
    }
  );

  return WorkflowGlobalSetting;
};
