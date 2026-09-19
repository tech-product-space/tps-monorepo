'use strict';
module.exports = (sequelize, DataTypes) => {
  const Education = sequelize.define('Education', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    institution: DataTypes.STRING,
    degree: DataTypes.STRING,
    startMonth: DataTypes.STRING,
    startYear: DataTypes.STRING,
    endMonth: DataTypes.STRING,
    endYear: DataTypes.STRING,
  }, {});

  Education.associate = function (models) {
    Education.belongsTo(models.users, {
      foreignKey: 'userId',
      onDelete: 'CASCADE',
    });
  };

  return Education;
};
