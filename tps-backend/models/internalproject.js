'use strict';
module.exports = (sequelize, DataTypes) => {
  const InternalProject = sequelize.define('InternalProject', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  formData: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  }, {
    tableName: 'InternalProjects'
  });

  return InternalProject;
};
