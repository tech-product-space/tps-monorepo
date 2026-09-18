'use strict';
module.exports = (sequelize, DataTypes) => {
  const JobApplication = sequelize.define('JobApplication', {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    resume: DataTypes.STRING,
    phoneNumber: DataTypes.STRING,
    linkedinProfile: DataTypes.STRING,
    portfolioLink: DataTypes.STRING,
    role: DataTypes.STRING,
    jobId: DataTypes.STRING,
    yearsOfExperience: DataTypes.STRING,

    currentCTC: DataTypes.STRING,
    expectedCTC: DataTypes.STRING,
    noticePeriod: DataTypes.STRING,
    openToRelocate: DataTypes.BOOLEAN
  }, {
    tableName: 'job_applications'
  });

  JobApplication.associate = models => {
    JobApplication.belongsTo(models.users, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE'
    });
  };

  return JobApplication;
};
