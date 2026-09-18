'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContactDetail extends Model {
    static associate(models) {
      ContactDetail.belongsTo(models.ContactList, {
        foreignKey: 'contactListId',
        as: 'contactList',
      });
    }
  }

  ContactDetail.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      contactListId: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      email: {
        type: DataTypes.STRING,
      },

      phone: {
        type: DataTypes.STRING,
      },
    },
    {
      sequelize,
      modelName: 'ContactDetail',
      tableName: 'ContactDetails',
      timestamps: true,
      updatedAt: false,
    }
  );

  return ContactDetail;
};