import db from "../../database/postgres/models/index.js";
const { User } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { USER_LOGIN_SOURCE, USER_STATUS } from "../../config/constants/user.js";
import { hashPassword } from "../../util/password.util.js";

export const registerController = asyncWrapper(async (req, res) => {
  const { fullName, email, phone, password } = req.body;

  // Validate required fields
  if (!fullName || !email || !password) {
    return res.status(400).json({
      message: "Full name, email, password and confirm password are required",
    });
  }


  // Check if user already exists
  const existingUser = await User.findOne({
    where: { email },
  });

  if (existingUser) {
    return res.status(409).json({
      message: "Email already registered",
    });
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const user = await User.create({
    fullName,
    email,
    phone,
    password: hashedPassword,
    loginSource: USER_LOGIN_SOURCE.EMAIL,
    status: USER_STATUS.ACTIVE,
  });


  return res.status(201).json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      profilePicture: user.profilePicture,
      emailVerified: user.emailVerified,
    },
  });

});