import { Model } from "sequelize";
import { ulid } from "ulid";
import { ADMIN_INVITE_STATUS } from "../../../config/constants/admin.js";

export default (sequelize, DataTypes) => {
  class AdminUser extends Model {
    static associate(models) {
      AdminUser.belongsTo(models.AdminRole, {
        foreignKey: "roleId",
        as: "role",
      });
    }
  }

  AdminUser.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      roleId: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },

      password: {
        type: DataTypes.STRING,
      },

      inviteStatus: {
        type: DataTypes.STRING,
        default: ADMIN_INVITE_STATUS.PENDING
      },

      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },

      lastLogin: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "AdminUser",
      tableName: "admin_users",
      timestamps: true,
    },
  );

  return AdminUser;
};
