const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const { User, Lead, sequelize } = require('../models');
const { ROLES, ALL_ROLES, isAssignableRole, hasGlobalScope } = require('../config/constants/roles');

// --- Team-scope helpers ----------------------------------------------------
// A Superadmin manages everyone. A Manager manages exactly their direct
// reports: they may create Agents under themselves and fully administer those
// users (edit, deactivate, reset password). Peers, other teams and their own
// record are off limits — self-service on their own account goes through the
// profile routes, and only a Superadmin can move someone between teams.

const isSuperadmin = (actor) => actor.role === ROLES.SUPERADMIN;

const sameId = (a, b) =>
  !!a && !!b && a.toString().toLowerCase() === b.toString().toLowerCase();

const managesTarget = (actor, target) => sameId(actor.id, target.manager_id);

// Returns an error message when the actor may not administer this user, or
// null when they may.
const denyReason = (actor, target) => {
  if (isSuperadmin(actor)) return null;
  if (sameId(actor.id, target.id)) return 'You cannot modify your own account here.';
  if (!managesTarget(actor, target)) return 'You can only manage users on your own team.';
  return null;
};

/**
 * Controller: List users with active lead counts.
 * Superadmin sees the whole org; a Manager sees themselves + their direct
 * reports. A Program Manager reads the whole directory (they need every agent's
 * name to make sense of org-wide leads) but administers nobody — writes are
 * refused by denyReason and by the read-only middleware.
 */
const getAllUsers = async (req, res) => {
  try {
    const scope = hasGlobalScope(req.user.role)
      ? {}
      : { [Op.or]: [{ manager_id: req.user.id }, { id: req.user.id }] };

    const users = await User.findAll({
      where: scope,
      attributes: { exclude: ['password_hash'] },
      include: [
        {
          model: User,
          as: 'Manager',
          attributes: ['id', 'name']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // Add lead counts manually for simplicity in V1
    // In production, use Sequelize literal or separate aggregation
    const usersWithCounts = await Promise.all(users.map(async (u) => {
      const activeLeadsCount = await Lead.count({ 
        where: { agent_id: u.id, is_deleted: false } 
      });
      return { ...u.toJSON(), activeLeadsCount };
    }));

    res.status(200).json(usersWithCounts);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Error fetching users.' });
  }
};

/**
 * Controller: Get Manager's team members
 */
const getMyTeam = async (req, res) => {
  try {
    // Build OR conditions: always include self + direct subordinates
    const orConditions = [
      { manager_id: req.user.id },  // subordinates (for managers)
      { id: req.user.id }           // self
    ];

    // For Agents: also include peers under the same manager so names can be resolved in UI
    if (req.user.manager_id) {
      orConditions.push({ manager_id: req.user.manager_id });
      orConditions.push({ id: req.user.manager_id }); // include the manager themselves
    }

    const users = await User.findAll({
      where: { 
        [Op.or]: orConditions,
        is_active: true 
      },
      attributes: { exclude: ['password_hash'] }
    });
    res.status(200).json(users);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Error fetching team.' });
  }
};

/**
 * Controller: Create new user (Superadmin: any role; Manager: Agents on their own team)
 */
const createUser = async (req, res) => {
  try {
    const { name, email, phone, password, role, managerId } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required.' });
    }

    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${ALL_ROLES.join(', ')}.` });
    }

    // Managers can only grow their own team, and only with Agents.
    let effectiveManagerId = managerId || null;
    if (!isSuperadmin(req.user)) {
      if (role !== ROLES.AGENT) {
        return res.status(403).json({ error: 'Managers can only create Agents.' });
      }
      effectiveManagerId = req.user.id;
    }

    const existingUser = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email: email.toLowerCase().trim(),
      phone,
      password_hash,
      role,
      // Only Agents/Managers sit in the reporting hierarchy. Supervisory roles
      // (Superadmin, Program Manager) have no manager, so drop any stray value.
      manager_id: isAssignableRole(role) ? effectiveManagerId : null,
      is_active: true
    });

    const userResponse = newUser.toJSON();
    delete userResponse.password_hash;

    res.status(201).json(userResponse);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Error creating user.' });
  }
};

/**
 * Controller: Update user details
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, managerId } = req.body;

    if (role !== undefined && !ALL_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${ALL_ROLES.join(', ')}.` });
    }

    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const denied = denyReason(req.user, user);
    if (denied) return res.status(403).json({ error: denied });

    // A Manager keeps their reports as Agents on their own team — promoting
    // someone or handing them to another manager stays a Superadmin action.
    if (!isSuperadmin(req.user)) {
      if (role !== undefined && role !== ROLES.AGENT) {
        return res.status(403).json({ error: 'Managers can only manage Agents.' });
      }
      if (managerId !== undefined && !sameId(managerId, req.user.id)) {
        return res.status(403).json({ error: 'Only a Superadmin can move a user to another team.' });
      }
    }

    const nextRole = role || user.role;

    await user.update({
      name: name || user.name,
      email: email ? email.toLowerCase().trim() : user.email,
      phone: phone || user.phone,
      role: nextRole,
      // Promoting into a supervisory role clears the reporting line, so a
      // stale manager_id can't linger on a user who no longer has a manager.
      manager_id: isAssignableRole(nextRole)
        ? (managerId !== undefined ? (managerId || null) : user.manager_id)
        : null
    });

    const userResponse = user.toJSON();
    delete userResponse.password_hash;

    res.status(200).json(userResponse);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Error updating user.' });
  }
};

/**
 * Controller: Deactivate user and reassign leads
 */
const deactivateUser = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { reassignTo } = req.body; // New agent ID or null to mark unassigned

    const user = await User.findByPk(id);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: 'User not found.' });
    }

    const denied = denyReason(req.user, user);
    if (denied) {
      await transaction.rollback();
      return res.status(403).json({ error: denied });
    }

    // A Manager can only hand the leads to someone still on their team.
    if (!isSuperadmin(req.user) && reassignTo) {
      const target = await User.findByPk(reassignTo);
      if (!target || !(sameId(target.id, req.user.id) || managesTarget(req.user, target))) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Leads can only be reassigned within your team.' });
      }
    }

    if (user.role === ROLES.SUPERADMIN) {
      const adminCount = await User.count({ where: { role: ROLES.SUPERADMIN, is_active: true } });
      if (adminCount <= 1) {
        await transaction.rollback();
        return res.status(400).json({ error: 'At least one admin must stay active.' });
      }
    }

    // Reassign leads
    await Lead.update(
      { agent_id: reassignTo || null },
      { where: { agent_id: id }, transaction }
    );

    // Deactivate user
    await user.update({ is_active: false }, { transaction });

    await transaction.commit();
    res.status(200).json({ message: 'User deactivated and leads reassigned.' });
  } catch (error) {
    await transaction.rollback();
    console.error('Deactivate user error:', error);
    res.status(500).json({ error: 'Error deactivating user.' });
  }
};

/**
 * Controller: Reactivate user
 */
const reactivateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const denied = denyReason(req.user, user);
    if (denied) return res.status(403).json({ error: denied });

    await user.update({ is_active: true });
    res.status(200).json({ message: 'User reactivated.' });
  } catch (error) {
    console.error('Reactivate user error:', error);
    res.status(500).json({ error: 'Error reactivating user.' });
  }
};

/**
 * Controller: Admin reset password
 */
const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const denied = denyReason(req.user, user);
    if (denied) return res.status(403).json({ error: denied });

    const password_hash = await bcrypt.hash(newPassword, 10);
    await user.update({ password_hash });

    res.status(200).json({ message: 'Password reset successful.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Error resetting password.' });
  }
};

/**
 * Controller: Users the requester may invite to a Google Meet
 * (Agent → own manager + Superadmins; Manager → team Agents + Superadmins;
 * Superadmin → everyone). Same candidate set is enforced on POST /meetings.
 */
const getMeetingAttendees = async (req, res) => {
  try {
    const { getAttendeeCandidates } = require('../services/meeting.service');
    const users = await getAttendeeCandidates(req.user);
    res.status(200).json({ users });
  } catch (error) {
    console.error('Get meeting attendees error:', error);
    res.status(500).json({ error: 'Error fetching attendee candidates.' });
  }
};

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
  deactivateUser,
  reactivateUser,
  resetPassword,
  getMyTeam,
  getMeetingAttendees
};
