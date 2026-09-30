import { DataTypes } from "sequelize";
import { ulid } from "ulid";

const JOB_SOURCE = {
  EXTERNAL: "EXTERNAL",
  INTERNAL: "INTERNAL",
};

export default (sequelize) => {
  const jobsBoard = sequelize.define(
    "jobsBoard",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
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

      salaryInfo: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      benefits: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      descriptionHtml: DataTypes.TEXT,
      descriptionText: DataTypes.TEXT,

      companyName: DataTypes.TEXT,
      companyLogo: DataTypes.TEXT,
      companyDescription: DataTypes.TEXT,
      companyWebsite: DataTypes.TEXT,

      companyEmployeesCount: DataTypes.INTEGER,

      companyLinkedinUrl: DataTypes.TEXT,

      companyAddress: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      jobType: DataTypes.STRING,
      uploadedBy: DataTypes.STRING,

      jobSource: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: JOB_SOURCE.EXTERNAL,
        validate: {
          isIn: [Object.values(JOB_SOURCE)],
        },
      },
    },
    {
      tableName: "jobsBoards",
      timestamps: true,
    }
  );

  return jobsBoard;
};