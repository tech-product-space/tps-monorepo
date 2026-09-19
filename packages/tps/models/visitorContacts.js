"use strict";

module.exports = (sequelize, DataTypes) => {
  const VisitorContact = sequelize.define(
    "VisitorContact",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      visitorId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      source: {
        type: DataTypes.STRING,
        allowNull: false,
      }
    },
    {
      tableName: "VisitorContacts",
      timestamps: true,
    }
  );

  VisitorContact.associate = function (models) {
    VisitorContact.belongsTo(models.Visitor, {
      foreignKey: "visitorId",
      as: "visitor",
    });
  };

  return VisitorContact;
};
