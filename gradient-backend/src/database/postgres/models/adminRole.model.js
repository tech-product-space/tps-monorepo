import { Model } from "sequelize";
import { ulid } from "ulid";

export default (sequelize, DataTypes) => {
  class AdminRole extends Model {
    static associate(models) {
      AdminRole.hasMany(models.AdminUser, {
        foreignKey: "roleId",
        as: "users",
      });
    }
  }

  AdminRole.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
        // Backed by admin_roles_name_unique. Without it, a re-run seeder was
        // silently stacking extra "Super Admin" rows into the role dropdown.
        unique: true,
      },

      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: "AdminRole",
      tableName: "admin_roles",
      timestamps: true,
    },
  );

  return AdminRole;
};
