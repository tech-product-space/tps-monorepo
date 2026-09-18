'use strict';
module.exports = (sequelize, DataTypes) => {
  const Achievement = sequelize.define('Achievement', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    title: DataTypes.STRING,
    description: DataTypes.TEXT,
    issuingOrganization: DataTypes.STRING,
    date: DataTypes.DATE,
    proof: DataTypes.STRING,
    uploadpdfUrl: DataTypes.STRING,
    submittedAt: DataTypes.DATE,
  });

  Achievement.associate = (models) => {
    Achievement.belongsTo(models.users, {
      foreignKey: "userId",
      onDelete: "CASCADE",
    });
  };

  return Achievement;
};
