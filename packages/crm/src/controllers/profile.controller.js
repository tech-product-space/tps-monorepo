const { Op } = require("sequelize");
const {
  LeadProfile,
  Lead,
  Activity,
  LeadNote,
  User,
  Product,
  Subsource,
  Status,
} = require("../models");
const { parsePagination, buildPage } = require("../utils/pagination");

const getFullProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await LeadProfile.findByPk(id, {
      include: [
        {
          model: Lead,
          as: "Leads",
          include: [
            {
              model: User,
              as: "Agent",
              attributes: ["id", "name", "email", "phone"],
            },
            {
              model: Status,
              as: "StatusConfig",
            },
            {
              model: Product,
              as: "ProductConfig",
            },
            {
              model: Subsource,
              as: "SubsourceConfig",
            },
            {
              model: Activity,
              as: "Activities",
              separate: true,
              order: [["created_at", "DESC"]],
            },
            {
              model: LeadNote,
              as: "Notes",
              separate: true,
              order: [["created_at", "DESC"]],
            },
          ],
        },
        {
          model: Activity,
          as: "Activities",
          separate: true,
          order: [["created_at", "DESC"]],
        },
        {
          model: LeadNote,
          as: "Notes",
          separate: true,
          order: [["created_at", "DESC"]],
        },
      ],
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error("Get profile error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
};

/**
 * Get profile timeline — all activities across every lead for this profile
 */
const getProfileTimeline = async (req, res) => {
  try {
    const { id } = req.params;
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });

    const profile = await LeadProfile.findByPk(id);
    if (!profile) return res.status(404).json({ error: "Profile not found." });

    const { count, rows } = await Activity.findAndCountAll({
      where: { profile_id: id },
      order: [["created_at", "DESC"]],
      limit,
      offset,
      include: [
        {
          model: Lead,
          as: "Lead",
          attributes: ["id", "product_id", "status_id"],
        },
        { model: User, as: "Actor", attributes: ["id", "name", "role"] },
      ],
    });

    res.status(200).json(
      buildPage(
        { rows, count, page, limit },
        {
          profile: {
            id: profile.id,
            name: profile.name,
            phone: profile.phone,
            email: profile.email,
            intent: profile.intent,
            interested_products: profile.interested_products,
          },
        },
      ),
    );
  } catch (error) {
    console.error("Profile timeline error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

/**
 * Get all leads linked to a profile
 */
const getProfileLeads = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await LeadProfile.findByPk(id);
    if (!profile) return res.status(404).json({ error: "Profile not found." });

    const leads = await Lead.findAll({
      where: { profile_id: id, is_deleted: false },
      order: [["lead_update_date", "DESC"]],
      include: [
        { model: User, as: "Agent", attributes: ["id", "name"] },
        { model: Product, as: "ProductConfig", attributes: ["id", "label"] },
      ],
    });

    res.status(200).json({ profile, leads });
  } catch (error) {
    console.error("Profile leads error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

/**
 * Search profiles by name, email, or phone
 */
const searchProfiles = async (req, res) => {
  try {
    const { search } = req.query;
    if (!search)
      return res.status(400).json({ error: "search query required" });

    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20 });

    const { count, rows } = await LeadProfile.findAndCountAll({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } },
        ],
      },
      order: [["updated_at", "DESC"]],
      limit,
      offset,
    });

    res.status(200).json(buildPage({ rows, count, page, limit }));
  } catch (error) {
    console.error("Search profiles error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

/**
 * PATCH /profiles/:id/contact
 * Update name and/or email, append old value to history, log Audit activity.
 */
const updateProfileContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;
    const userId = req.user?.id || null;

    const profile = await LeadProfile.findByPk(id);
    if (!profile) {
      return res.status(404).json({ success: false, message: "Profile not found" });
    }

    const updates = {};
    const parts = [];

    // Deduplicate a history array by value, keeping the most recent entry for each unique value.
    const dedupeHist = (entries) => {
      const seen = new Set();
      return entries.filter((e) => {
        const key = e.value ?? "__null__";
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    if (name !== undefined && name.trim() && name.trim() !== profile.name) {
      const hist = Array.isArray(profile.name_history) ? profile.name_history : [];
      updates.name = name.trim();
      updates.name_history = dedupeHist([
        { value: profile.name, changed_at: new Date().toISOString(), changed_by: userId },
        ...hist,
      ]).slice(0, 20);
      parts.push(`name changed from "${profile.name}" to "${name.trim()}"`);
    }

    if (email !== undefined && (email || null) !== (profile.email || null)) {
      const hist = Array.isArray(profile.email_history) ? profile.email_history : [];
      updates.email = email || null;
      updates.email_history = dedupeHist([
        { value: profile.email || null, changed_at: new Date().toISOString(), changed_by: userId },
        ...hist,
      ]).slice(0, 20);
      parts.push(`email changed from "${profile.email || "(none)"}" to "${email || "(none)"}"`);
    }

    if (!parts.length) {
      return res.json({ success: true, data: profile });
    }

    await profile.update(updates);

    // Attach audit to the most recent lead for this profile so it appears in its timeline.
    const firstLead = await Lead.findOne({
      where: { profile_id: id, is_deleted: false },
      order: [["lead_update_date", "DESC"]],
      attributes: ["id"],
    });

    await Activity.create({
      lead_id: firstLead?.id || null,
      profile_id: id,
      actor_id: userId,
      type: "Audit",
      title: "Profile contact updated",
      details: parts.join("; ") + ".",
      metadata: {
        action: "profile_contact_updated",
        profile_id: id,
        fields: Object.keys(updates).filter((k) => !k.endsWith("_history")),
      },
    });

    res.json({ success: true, data: profile });
  } catch (error) {
    console.error("Update profile contact error:", error);
    res.status(500).json({ success: false, message: "Failed to update profile" });
  }
};

module.exports = { getProfileTimeline, getProfileLeads, searchProfiles, getFullProfile, updateProfileContact };
