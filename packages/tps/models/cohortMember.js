"use strict";
const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const CohortMember = sequelize.define(
    "CohortMember",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      course: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      cohort: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      role: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      additional_data: {
        type: DataTypes.JSONB,
      },
    },
    {
      tableName: "cohort_members",
      paranoid: true,
      timestamps: true,
    }
  );

  CohortMember.associate = function (models) {
    CohortMember.belongsTo(models.users, {
      foreignKey: "userId",
      as: "user",
    });
  };

  return CohortMember;
};
