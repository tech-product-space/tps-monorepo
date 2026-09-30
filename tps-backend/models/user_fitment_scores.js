module.exports = (sequelize, DataTypes) => {
  const UserFitmentScores = sequelize.define("user_fitment_scores", {
    role_fitment_score: DataTypes.TEXT,
    strength_1: DataTypes.TEXT,
    strength_2: DataTypes.TEXT,
    strength_3: DataTypes.TEXT,
    weakness_1: DataTypes.TEXT,
    weakness_2: DataTypes.TEXT,
    weakness_3: DataTypes.TEXT,
    resume_improvement_1: DataTypes.TEXT,
    resume_improvement_2: DataTypes.TEXT,
    resume_improvement_3: DataTypes.TEXT,
    overall_relevance_score: DataTypes.FLOAT,
    companyName: DataTypes.STRING,
    jobDescription: DataTypes.TEXT,
    resumeUrl: DataTypes.STRING,
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  });

  UserFitmentScores.associate = (models) => {
    UserFitmentScores.belongsTo(models.users, { foreignKey: "userId" });
  };

  return UserFitmentScores;
};
