module.exports = (sequelize, DataTypes) => {
  const WorkExperience = sequelize.define("WorkExperience", {
    company: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    employmentType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    startMonth: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    startYear: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    endMonth: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    endYear: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    currentlyWorking: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  });

  WorkExperience.associate = (models) => {
    WorkExperience.belongsTo(models.users, {
      foreignKey: "userId",
      onDelete: "CASCADE",
    });
  };

  return WorkExperience;
};
