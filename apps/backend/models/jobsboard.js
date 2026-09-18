"use strict";
const { Model } = require("sequelize");
const { JOB_SOURCE, JOB_STATUS } = require("../constants/jobs");
module.exports = (sequelize, DataTypes) => {
  class jobsBoard extends Model {
    static associate(models) {}
  }
  jobsBoard.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      title: DataTypes.TEXT,
      location: DataTypes.TEXT,
      postedAt: DataTypes.DATE,
      applyUrl: DataTypes.TEXT,
      link: DataTypes.TEXT,
      inputUrl: DataTypes.TEXT,
      trackingId: DataTypes.TEXT,
      refId: DataTypes.TEXT,
      applicantsCount: DataTypes.TEXT,
      employmentType: DataTypes.TEXT,
      seniorityLevel: DataTypes.TEXT,
      jobFunction: DataTypes.TEXT,
      industries: DataTypes.TEXT,
      salaryInfo: DataTypes.JSON,
      benefits: DataTypes.JSON,
      descriptionHtml: DataTypes.TEXT,
      descriptionText: DataTypes.TEXT,
      companyName: DataTypes.TEXT,
      companyLogo: DataTypes.TEXT,
      companyDescription: DataTypes.TEXT,
      companyWebsite: DataTypes.TEXT,
      companyEmployeesCount: DataTypes.INTEGER,
      companyLinkedinUrl: DataTypes.TEXT,
      companyAddress: DataTypes.JSON,
      jobType: DataTypes.STRING,
      uploadedBy: DataTypes.STRING,
      jobSource: {
        type: DataTypes.STRING,
        defaultValue: JOB_SOURCE.EXTERNAL,
        allowNull: false,
        validate: {
          isIn: [Object.values(JOB_SOURCE)],
        },
      },
      status: {
        type: DataTypes.STRING,
        defaultValue: JOB_STATUS.PUBLISHED,
        allowNull: false,
        validate: {
          isIn: [Object.values(JOB_STATUS)],
        },
      },
      repostedAt: DataTypes.DATE,
      repostCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "jobsBoard",
    },
  );
  return jobsBoard;
};
