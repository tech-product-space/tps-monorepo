'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContactList extends Model {
    /**
     * Define associations here
     */
    static associate(models) {
      // One ContactList has many ContactDetails
      ContactList.hasMany(models.ContactDetail, {
        foreignKey: 'contactListId',
        as: 'contacts',
        onDelete: 'CASCADE',
      });
    }
  }

  ContactList.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'ContactList',
      tableName: 'ContactLists', 
      timestamps: true,
    }
  );

  return ContactList;
};