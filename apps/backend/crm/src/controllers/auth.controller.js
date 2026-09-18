const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, RefreshToken, AdminWorkspaceGrant } = require('../models');

/**
 * A user's workspace grants, as { workspace, role } pairs, for the JWT and
 * for unified-admin's workspace switcher. Always includes at least a `crm`
 * entry at the user's own `role` even if no grant row exists yet, so
 * pre-existing CRM users aren't locked out before the backfill migration
 * (20260918000001) has run against their environment.
 */
const getWorkspaces = async (user) => {
  const grants = await AdminWorkspaceGrant.findAll({ where: { user_id: user.id } });
  const workspaces = grants.map((g) => ({ workspace: g.workspace, role: g.role }));
  if (!workspaces.some((w) => w.workspace === 'crm')) {
    workspaces.push({ workspace: 'crm', role: user.role });
  }
  return workspaces;
};

/**
 * Generate tokens for user
 * @param {Object} user
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokens = async (user) => {
  const workspaces = await getWorkspaces(user);

  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, workspaces },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  // Store refresh token in DB
  await RefreshToken.create({
    user_id: user.id,
    token: refreshToken,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });

  return { accessToken, refreshToken };
};

/**
 * Controller: Handles user login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const { accessToken, refreshToken } = await generateTokens(user);
    const workspaces = await getWorkspaces(user);

    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        managerId: user.manager_id,
        workspaces
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
};

/**
 * Controller: Handles token refresh
 */
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required.' });
    }

    const storedToken = await RefreshToken.findOne({ where: { token: refreshToken } });
    if (!storedToken || storedToken.expires_at < new Date()) {
      if (storedToken) await storedToken.destroy();
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or account deactivated.' });
    }

    // Reuse/Replace Refresh Token strategy
    await storedToken.destroy();
    const tokens = await generateTokens(user);

    res.status(200).json(tokens);
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ error: 'Invalid refresh token.' });
  }
};

/**
 * Controller: Handles logout
 */
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await RefreshToken.destroy({ where: { token: refreshToken } });
    }
    // Alternatively, clear all tokens for current session
    // if (req.user) await RefreshToken.destroy({ where: { user_id: req.user.id } });
    
    res.status(200).json({ message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Error during logout.' });
  }
};

module.exports = {
  login,
  refresh,
  logout
};
