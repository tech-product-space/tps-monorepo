const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { company } = require("../models");
const { sendEmail, generateEmailHtml } = require("../utils/sendEmail");

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

// Access tokens are short-lived; the admin panel silently refreshes them with
// the long-lived refresh token (see POST /company/refresh) so an active session
// never dies mid-task. `type` distinguishes the two so a refresh token can't be
// replayed as an access token.
const ACCESS_TOKEN_TTL = process.env.COMPANY_ACCESS_TTL || "1h";
const REFRESH_TOKEN_TTL = process.env.COMPANY_REFRESH_TTL || "30d";

const signAccessToken = (user) =>
  jwt.sign({ user_id: user.id, role: user.role, type: "access" }, SECRET_KEY, {
    expiresIn: ACCESS_TOKEN_TTL,
  });

const signRefreshToken = (user) =>
  jwt.sign({ user_id: user.id, type: "refresh" }, SECRET_KEY, {
    expiresIn: REFRESH_TOKEN_TTL,
  });

const companySignup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await company.findOne({ where: { email } });
    if (existingUser)
      return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await company.create({
      name,
      email,
      password: hashedPassword,
      role: "superadmin",
    });

    res.status(201).json({ message: "User registered successfully", user });
  } catch (error) {
    console.error("Signup Error:", error);
    res
      .status(500)
      .json({ error: "Something went wrong", details: error.message });
  }
};

const companyLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await company.findOne({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({
      message: "Login successful",
      token,
      refreshToken,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Something went wrong", details: error.message });
  }
};

const loginWithGoogle = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await company.findOne({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({
      message: "Login successful",
      token,
      refreshToken,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Something went wrong", details: error.message });
  }
};

// POST /company/refresh — exchange a valid refresh token for a new access
// token. Stateless: the refresh token is a signed JWT, not stored server-side
// (consistent with the rest of the auth here). On any failure the caller is
// expected to send the user back to login.
const refreshToken = async (req, res) => {
  try {
    const incoming = req.body.refreshToken || req.body.refresh_token;
    if (!incoming)
      return res.status(400).json({ error: "Refresh token required" });

    let decoded;
    try {
      decoded = jwt.verify(incoming, SECRET_KEY);
    } catch (err) {
      return res
        .status(401)
        .json({ error: "Invalid or expired refresh token" });
    }

    if (!decoded || decoded.type !== "refresh" || !decoded.user_id) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const user = await company.findByPk(decoded.user_id);
    if (!user) return res.status(401).json({ error: "User not found" });

    return res.json({ token: signAccessToken(user) });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Something went wrong", details: error.message });
  }
};

const inviteUser = async (req, res) => {
  try {
    const { name, email, role } = req.body;

    const existingUser = await company.findOne({ where: { email } });
    if (existingUser) return res.status(400).json({ error: "Email already exists" });

    const token = uuidv4();
    await company.create({
      name,
      email,
      role,
      password: null,
      inviteToken: token,
    });

    const inviteLink = `${process.env.ADMIN_FRONTEND_URL}/auth/invite?token=${token}`;
    const emailHtml = generateEmailHtml(inviteLink);

    await sendEmail(
      email,
      "Welcome to The Product Space - Invitation",
      emailHtml,
      true
    );

    res.status(200).json({ message: "Invite sent", inviteLink });
  } catch (error) {
    console.error("Invite Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

const setPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = await company.findOne({ where: { inviteToken: token } });
    if (!user) return res.status(400).json({ error: "Invalid or expired token" });

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password set successfully. You can now log in." });
  } catch (error) {
    console.error("Set Password Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await company.findAll({
      where: {
        role: { [require("sequelize").Op.ne]: "superadmin" },
      },
      attributes: { exclude: ["password"] },
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({ users });
  } catch (error) {
    console.error("Get Users Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;

    const user = await company.findByPk(id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Optional: check if email is being changed and already exists
    if (email && email !== user.email) {
      const emailExists = await company.findOne({ where: { email } });
      if (emailExists) return res.status(400).json({ error: "Email already exists" });
    }

    user.name = name || user.name;
    user.email = email || user.email;
    user.role = role || user.role;

    await user.save();

    res.status(200).json({ message: "User updated successfully", user });
  } catch (error) {
    console.error("Update User Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await company.findByPk(id);
    if (!user) return res.status(404).json({ error: "User not found" });

    await user.destroy();

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete User Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

const getUserByInviteToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) return res.status(400).json({ error: "Token is required" });

    const user = await company.findOne({
      where: { inviteToken: token },
      attributes: ["name", "email"],
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.status(200).json({ user });
  } catch (error) {
    console.error("Get User by Token Error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

module.exports = { companyLogin, companySignup, loginWithGoogle, refreshToken, inviteUser, setPassword, getAllUsers, updateUser, deleteUser, getUserByInviteToken };