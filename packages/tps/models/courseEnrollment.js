'use strict';

const { ulid } = require("ulid");

module.exports = (sequelize, DataTypes) => {
  const CourseEnrollment = sequelize.define('CourseEnrollment', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      defaultValue: () => ulid(),
    },
    user_id: DataTypes.INTEGER,
    course_id: DataTypes.STRING,
    name: DataTypes.STRING,
    phone: DataTypes.STRING,
    form_data: DataTypes.JSONB
  }, {
    tableName: 'course_enrollments'
  });

  CourseEnrollment.associate = (models) => {
    CourseEnrollment.belongsTo(models.users, {
      foreignKey: 'user_id',
      as: 'user'
    });

    CourseEnrollment.belongsTo(models.Course, {
      foreignKey: 'course_id',
      as: 'course'
    });
  };

  return CourseEnrollment;
};
