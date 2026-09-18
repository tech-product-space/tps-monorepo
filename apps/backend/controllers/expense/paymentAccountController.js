const { Op } = require("sequelize");
const { ExpensePaymentAccount } = require("../../models");

// List accounts. Pass ?all=true to include archived (is_active=false) ones.
const listPaymentAccounts = async (req, res) => {
  try {
    const includeArchived = req.query.all === "true";
    const where = includeArchived ? {} : { is_active: true };

    const accounts = await ExpensePaymentAccount.findAll({
      where,
      order: [["name", "ASC"]],
    });
    res.status(200).json({ success: true, data: accounts });
  } catch (error) {
    console.error("Error listing payment accounts:", error);
    res.status(500).json({ error: "Failed to fetch payment accounts", details: error.message });
  }
};

// Case-insensitive name lookup, optionally excluding one id (for renames).
async function findByName(name, excludeId) {
  const where = { name: { [Op.iLike]: name } };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return ExpensePaymentAccount.findOne({ where });
}

const createPaymentAccount = async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "'name' is required" });

  try {
    const trimmed = name.trim();

    // Creating a name that already exists returns the existing row instead of a
    // duplicate — the expense dialog's "Add" path relies on this being safe to
    // call optimistically, and it keeps "petty cash" from forking "Petty Cash".
    const existing = await findByName(trimmed);
    if (existing) {
      if (!existing.is_active) {
        existing.is_active = true;
        await existing.save();
      }
      return res.status(200).json({ success: true, data: existing });
    }

    const account = await ExpensePaymentAccount.create({
      name: trimmed,
      created_by: req.staff?.id || req.user?.id || req.body.created_by || null,
    });
    res.status(201).json({ success: true, data: account });
  } catch (error) {
    console.error("Error creating payment account:", error);
    res.status(500).json({ error: "Failed to create payment account", details: error.message });
  }
};

const updatePaymentAccount = async (req, res) => {
  const { id } = req.params;
  const { name, is_active } = req.body;

  try {
    const account = await ExpensePaymentAccount.findByPk(id);
    if (!account) return res.status(404).json({ message: "Payment account not found" });

    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) return res.status(400).json({ error: "'name' cannot be empty" });
      if (await findByName(trimmed, id)) {
        return res.status(409).json({ error: `A payment account named "${trimmed}" already exists` });
      }
      account.name = trimmed;
    }
    if (is_active !== undefined) account.is_active = is_active;
    await account.save();

    res.status(200).json({ success: true, data: account });
  } catch (error) {
    console.error("Error updating payment account:", error);
    res.status(500).json({ error: "Failed to update payment account", details: error.message });
  }
};

// Soft-archive: keep the row so historical expenses keep a readable account
// name, but hide it from pickers.
const archivePaymentAccount = async (req, res) => {
  try {
    const account = await ExpensePaymentAccount.findByPk(req.params.id);
    if (!account) return res.status(404).json({ message: "Payment account not found" });

    account.is_active = false;
    await account.save();
    res.status(200).json({ success: true, message: "Payment account archived" });
  } catch (error) {
    console.error("Error archiving payment account:", error);
    res.status(500).json({ error: "Failed to archive payment account", details: error.message });
  }
};

module.exports = {
  listPaymentAccounts,
  createPaymentAccount,
  updatePaymentAccount,
  archivePaymentAccount,
};
