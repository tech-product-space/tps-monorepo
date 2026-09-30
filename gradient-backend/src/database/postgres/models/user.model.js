import { ulid } from "ulid";
import {
  USER_LOGIN_SOURCE,
  USER_STATUS,
} from "../../../config/constants/user.js";
import generateReferralCode from "../../../util/helpers/generateReferralCode.js";
import { emitTriggerEvent } from "../../../services/workflow/triggers/emitTriggerEvent.js";

export default (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => ulid(),
      },

      fullName: {
        field: "full_name",
        type: DataTypes.STRING,
        allowNull: false,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      password: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      loginSource: {
        field: "login_source",
        type: DataTypes.STRING,
        defaultValue: USER_LOGIN_SOURCE.EMAIL,
      },

      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: USER_STATUS.ACTIVE,
      },

      providerId: {
        field: "provider_id",
        type: DataTypes.STRING,
      },

      profilePicture: {
        field: "profile_picture",
        type: DataTypes.TEXT,
        allowNull: true,
      },

      emailVerified: {
        field: "email_verified",
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      lastLoginAt: {
        field: "last_login_at",
        type: DataTypes.DATE,
      },

      referralCode: {
        field: "referral_code",
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
    },
    {
      tableName: "users",
      underscored: true,
      timestamps: true,
      /**
       * Realtime workflow trigger — a new account is one of the five things
       * that can start a journey. On the model rather than in a controller
       * because sign-up has two paths (password register and Google first
       * sign-in), and a trigger that fires on only one of them looks like a
       * quiet workflow rather than a bug.
       */
      hooks: {
        afterCreate: (row, options) => emitTriggerEvent("users", row, options),
      },
    },
  );

  User.beforeCreate(async (user) => {
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 10) {
      const code = generateReferralCode();

      const found = await User.findOne({
        where: { referralCode: code },
      });

      if (!found) {
        user.referralCode = code;
        exists = false;
      }

      attempts++;
    }

    if (!user.referralCode) {
      throw new Error("Unable to generate unique referral code");
    }
  });

  return User;
};
