import { ulid } from "ulid";

/**
 * One person on one contact list.
 *
 * Membership of a list is **not** consent — a row here says an address was
 * uploaded, nothing more. Whether it may actually be emailed is answered by the
 * `subscribers` table, which every campaign checks per recipient. Do not add a
 * status column here; two answers to "may we email this" is the failure mode
 * the whole suppression design exists to avoid.
 */
export default (sequelize, DataTypes) => {
  const Contact = sequelize.define(
    "Contact",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => ulid(),
      },

      contactListId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Lowercased and trimmed on the way in — see the unique index. */
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isEmail: true },
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      /** Whatever else the CSV carried, keyed by its column header. */
      additionalData: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: "contacts",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["contactListId", "email"],
          name: "contacts_list_email_unique",
        },
      ],
    },
  );

  Contact.associate = (models) => {
    Contact.belongsTo(models.ContactList, {
      foreignKey: "contactListId",
      as: "list",
    });
  };

  return Contact;
};
