const { ExpenseTeam } = require("../../models");

// List teams. Pass ?all=true to include archived (is_active=false) ones.
const listTeams = async (req, res) => {
  try {
    const includeArchived = req.query.all === "true";
    const where = includeArchived ? {} : { is_active: true };

    const teams = await ExpenseTeam.findAll({
      where,
      order: [["name", "ASC"]],
    });
    res.status(200).json({ success: true, data: teams });
  } catch (error) {
    console.error("Error listing teams:", error);
    res.status(500).json({ error: "Failed to fetch teams", details: error.message });
  }
};

const createTeam = async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "'name' is required" });

  try {
    const team = await ExpenseTeam.create({
      name: name.trim(),
      created_by: req.user?.id || req.body.created_by || null,
    });
    res.status(201).json({ success: true, data: team });
  } catch (error) {
    console.error("Error creating team:", error);
    res.status(500).json({ error: "Failed to create team", details: error.message });
  }
};

const updateTeam = async (req, res) => {
  const { id } = req.params;
  const { name, is_active } = req.body;

  try {
    const team = await ExpenseTeam.findByPk(id);
    if (!team) return res.status(404).json({ message: "Team not found" });

    if (name !== undefined) team.name = name.trim();
    if (is_active !== undefined) team.is_active = is_active;
    await team.save();

    res.status(200).json({ success: true, data: team });
  } catch (error) {
    console.error("Error updating team:", error);
    res.status(500).json({ error: "Failed to update team", details: error.message });
  }
};

// Soft-archive: keep the row so historical forms/expenses keep a readable team
// name, but hide it from pickers.
const deleteTeam = async (req, res) => {
  const { id } = req.params;

  try {
    const team = await ExpenseTeam.findByPk(id);
    if (!team) return res.status(404).json({ message: "Team not found" });

    team.is_active = false;
    await team.save();
    res.status(200).json({ success: true, message: "Team archived" });
  } catch (error) {
    console.error("Error archiving team:", error);
    res.status(500).json({ error: "Failed to archive team", details: error.message });
  }
};

module.exports = { listTeams, createTeam, updateTeam, deleteTeam };
