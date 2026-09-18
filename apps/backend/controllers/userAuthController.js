const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { users } = require("../models");
const resetPasswordEmailTemplate = require("../utils/templates/resetPasswordEmailTemplate");
const { sendGraphEmail } = require("../utils/email/sendGraphEmail");

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

const userSignup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await users.findOne({ where: { email } });
    if (existingUser)
      return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await users.create({
      name,
      email,
      password: hashedPassword,
    });

    const token = jwt.sign(
      { user_id: user.id, email: user.email },
      SECRET_KEY,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        user_id: user.id,
        name: user.name,
        email: user.email,
      },
    });

  } catch (error) {
    console.error("Signup Error:", error);
    res
      .status(500)
      .json({ error: "Something went wrong", details: error.message });
  }
};

const userLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await users.findOne({ where: { email } });
    if (!user) return res.status(404).json({
      result: "ERROR", message: "User not found"
    });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({
      result: "ERROR", message: "Invalid credentials"
    });

    const token = jwt.sign(
      { user_id: user.id, email: user.email },
      SECRET_KEY,
      { expiresIn: "30d" }
    );

    res.json({
      result: "SUCCESS",
      message: "Login Successful",
      token,
      user: {
        user_id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ result: "ERROR", error: "Something went wrong", details: error.message });
  }
};

const userResetPassword = async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;

    const user = await users.findOne({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch)
      return res.status(401).json({ error: "Old password is incorrect" });

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await users.update(
      { password: hashedNewPassword },
      { where: { id: user.id } }
    );

    res.json({ message: "Password updated successfully" });

  } catch (error) {
    console.error("Reset Password Error:", error);
    res
      .status(500)
      .json({ error: "Something went wrong", details: error.message });
  }
};

const signupWithGoogle = async (req, res) => {
  try {
    const { name, email, profile_picture } = req.body;

    const existingUser = await users.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const user = await users.create({
      name,
      email,
      password: null,
      profile_picture: profile_picture
    });

    const token = jwt.sign(
      { user_id: user.id, email: user.email },
      SECRET_KEY,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        user_id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "Something went wrong", details: error.message });
  }
};

const loginWithGoogle = async (req, res) => {
  try {
    const { name, email, profile_picture } = req.body;

    const existingUser = await users.findOne({ where: { email } });
    if (!existingUser) {
      const user = await users.create({
        name,
        email,
        password: null,
        profile_picture: profile_picture
      });
      const token = jwt.sign(
        { user_id: user.id, email: user.email },
        SECRET_KEY,
        { expiresIn: "30d" }
      );

      res.json({
        result: "SUCCESS",
        message: "Login Successful",
        token,
        user: {
          user_id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    } else {
      const token = jwt.sign(
        { user_id: existingUser.id, email: existingUser.email },
        SECRET_KEY,
        { expiresIn: "30d" }
      );

      res.json({
        result: "SUCCESS",
        message: "Login Successful",
        token,
        user: {
          user_id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
        },
      });
    }

  } catch (error) {
    res.status(500).json({
      result: "ERROR", error: "Something went wrong", details: error.message
    });
  }
};

const isGoogleAuthenticated = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await users.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isGoogleAuthenticated = user.password === null;

    res.json({ isGoogleAuthenticated: isGoogleAuthenticated });
  } catch (error) {
    res.status(500).json({ error: "Something went wrong", details: error.message });
  }
};

const getUserFromToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, SECRET_KEY);

    const user = await users.findByPk(decoded.user_id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        user_id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).json({ error: "Unauthorized", details: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if(!email)
      return res.status(400).json({ error: "'email' is required" });

    const user = await users.findOne({ where: { email } });
    if (!user)
      return res.status(404).json({ error: "User not found" });

    const resetToken = jwt.sign(
      { user_id: user.id, email },
      SECRET_KEY,
      { expiresIn: "15m" }
    );

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    const resetEmailHtml = resetPasswordEmailTemplate(user.name, resetUrl);

    await sendGraphEmail({
      to: email,
      subject: "Reset Your Password – The Product Space",
      html: resetEmailHtml,
    });

    res.json({ message: "Password reset email sent" });

  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ error: "Something went wrong", details: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Verify JWT token
    const decoded = jwt.verify(token, SECRET_KEY);

    const user = await users.findByPk(decoded.user_id);
    if (!user)
      return res.status(404).json({ error: "User not found" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await users.update(
      { password: hashedPassword },
      { where: { id: user.id } }
    );

    res.json({ message: "Password reset successful" });

  } catch (error) {
    console.error("Reset Password Error:", error);

    if (error.name === "TokenExpiredError") {
      return res.status(400).json({ error: "Reset token expired" });
    }

    return res.status(400).json({ error: "Invalid token" });
  }
};

module.exports = { 
  userLogin, 
  userSignup, 
  signupWithGoogle, 
  loginWithGoogle, 
  userResetPassword, 
  isGoogleAuthenticated, 
  getUserFromToken,
  forgotPassword,
  resetPassword 
};