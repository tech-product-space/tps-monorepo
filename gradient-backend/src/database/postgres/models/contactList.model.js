import { ulid } from "ulid";

/**
 * A named group of email addresses uploaded from a CSV.
 *
 * The one audience source that is not derived from something the product
 * already recorded — a conference badge scan, a partner's list, a spreadsheet
 * somebody kept by hand. Everything else a campaign can target is a by-product
 * of a lead, a download or a registration.
 */
export default (sequelize, DataTypes) => {
  const ContactList = sequelize.define(
    "ContactList",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      createdBy: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "contact_lists",
      timestamps: true,
    },
  );

  ContactList.associate = (models) => {
    ContactList.hasMany(models.Contact, {
      foreignKey: "contactListId",
      as: "contacts",
    });

    ContactList.belongsTo(models.AdminUser, {
      foreignKey: "createdBy",
      as: "createdAdmin",
    });
  };

  return ContactList;
};
