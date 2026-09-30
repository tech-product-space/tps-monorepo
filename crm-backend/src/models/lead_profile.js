"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class LeadProfile extends Model {
    static associate(models) {
      LeadProfile.hasMany(models.Lead, {
        foreignKey: "profile_id",
        as: "Leads",
      });
      LeadProfile.hasMany(models.Activity, {
        foreignKey: "profile_id",
        as: "Activities",
      });
      LeadProfile.hasMany(models.LeadNote, {
        foreignKey: "profile_id",
        as: "Notes",
      });
      LeadProfile.hasMany(models.LeadCourse, {
        foreignKey: "lead_profile_id",
        as: "LeadCourses",
      });
      // Self-reported details from the onboarding portal. Deliberately NOT
      // included by default anywhere — only Superadmin and Program Manager may
      // read it (see canViewOnboardingDetails), so it is loaded explicitly by
      // the one endpoint that is allowed to.
      LeadProfile.hasOne(models.LeadProfileDetails, {
        foreignKey: "lead_profile_id",
        as: "Details",
      });
    }
  }

  LeadProfile.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
      },
      country_code: {
        type: DataTypes.STRING(10),
        defaultValue: "+91",
      },
      phone_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      phone_verified_source: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      intent: {
        type: DataTypes.STRING(10),
        defaultValue: "Low",
        validate: { isIn: [["High", "Low"]] },
      },
      name_history: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },
      email_history: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },
      interested_products: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: [],
      },
    },
    {
      sequelize,
      modelName: "LeadProfile",
      tableName: "lead_profiles",
      underscored: true,
    },
  );

  return LeadProfile;
};
