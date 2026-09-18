const {
  fireAfterCreate,
} = require("../service/workflow/triggers/hookHelper");

module.exports = (sequelize, DataTypes) => {
  const users = sequelize.define("users", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    phone: DataTypes.STRING,
    profile_picture: DataTypes.STRING,
    password: DataTypes.STRING,
  }, {
    timestamps: true,
    hooks: {
      afterCreate: (row, options) =>
        fireAfterCreate("users", row.id, options),
      afterBulkCreate: (rows, options) => {
        for (const row of rows) {
          fireAfterCreate("users", row.id, options);
        }
      },
    },
  });

  users.associate = function (models) {
    users.hasMany(models.ReferralCode, { foreignKey: 'userId' });
    users.hasMany(models.EventRegistration, { foreignKey: 'userId' });
    users.hasOne(models.PersonalInfo, { foreignKey: 'userId', as: 'PersonalInfo' });
    users.hasMany(models.WorkExperience, { foreignKey: 'userId', as: 'WorkExperiences' });
    users.hasMany(models.PortfolioProject, { foreignKey: 'userId', as: 'PortfolioProjects' });
    users.hasMany(models.Education, { foreignKey: 'userId', as: 'Educations' });
    users.hasMany(models.Achievement, { foreignKey: 'userId', as: 'Achievements' });
    users.hasMany(models.EventGuests, { foreignKey: 'userId', as: 'EventGuests' });
    // users.hasMany(models.JobApplication, { foreignKey: 'userId', as: 'JobApplication' });
    users.hasMany(models.CohortMember, { foreignKey: "userId" });
    users.hasMany(models.CourseEnrollment, {
      foreignKey: 'user_id',
      as: 'courseEnrollments'
    });
  };

  return users;
};