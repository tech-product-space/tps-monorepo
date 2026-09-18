const { Op } = require('sequelize');
const { Lead, LeadProfile, LeadNote, User, Status, Product, Activity, Subsource, LeadHistory, sequelize } = require('../models');
const { Sequelize } = require('sequelize');
const leadService = require('../services/lead.service');
const leadFilter = require('../services/leadFilter.service');
const { parsePagination, buildPage } = require('../utils/pagination');
const { isCalcomProduct } = require('../config/calcom');
const jwt = require("jsonwebtoken");

const { getLeadIdsFromHistory, getFollowupOrderClause } = leadFilter;

/**
 * Controller: Get all leads with pagination, filtering, search, and sorting
 */
const getLeads = async (req, res) => {
  try {
    const {
      sort = 'lead_update_date',
      order = 'DESC',
      product,
    } = req.query;

    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });

    const { where, profileWhere } = await leadFilter.buildLeadQuery(req);

    // Determine if we're filtering exclusively on one Cal.com product. Booking
    // lists are ordered by call time, not update time — and that only makes
    // sense when nothing else is mixed in, since no other product has a
    // startTime to sort by.
    const productList = product ? product.split(',') : [];
    const isCalcomOnly =
      productList.length === 1 && isCalcomProduct(productList[0]);

    const orderClause = isCalcomOnly
      ? [[Sequelize.literal(`(extra_fields->>'startTime')::timestamp`), 'DESC']]
      : leadFilter.buildOrderClause(sort, order);

    const { count, rows } = await Lead.findAndCountAll({
      where,
      limit,
      offset,
      order: orderClause,
      attributes: {
        include: [
          [
            // Notes belong to the *profile*, not a single product-lead row, so
            // we report the profile-wide note count. Every lead that shares a
            // profile_id will see the same number.
            Sequelize.literal(
              `(SELECT COUNT(*)::int FROM "lead_notes" WHERE "lead_notes"."profile_id" = "Lead"."profile_id")`
            ),
            'note_count',
          ],
          [
            // Drives the 🎓 marker on every lead table — "is this person a
            // current student?". ACTIVE only: someone who dropped out is a lead
            // again, and showing them as enrolled would tell an agent not to
            // work a lead they should be working.
            Sequelize.literal(
              `EXISTS (SELECT 1 FROM "lead_courses" WHERE "lead_courses"."lead_profile_id" = "Lead"."profile_id" AND "lead_courses"."status" = 'active')`
            ),
            'is_enrolled',
          ],
        ],
      },
      include: [
        { model: LeadProfile, as: 'Profile',
            ...(profileWhere ? { where: profileWhere } : {})
        },
        { model: User, as: 'Agent', attributes: ['id', 'name'] },
        { model: Subsource, as: 'SubsourceConfig', attributes: ['id', 'label'] },
        // DISABLED — LeadHistory is no longer sent with the leads list.
        //
        // With `separate: true` and no limit this pulled every audit row for all
        // 50 leads on the page — roughly 1,000 rows, each carrying two JSONB
        // blobs — on every list load, for every product tab. The only consumer
        // was the Events tab's event-name dropdown, which reduced all of it to
        // two or three distinct strings.
        //
        // Cost of disabling: that one dropdown loses its "previous events"
        // chevron (the cell still shows the current event name). Nothing else in
        // the frontend reads `lead.history`.
        //
        // Replacement: an on-demand `GET /leads/:id/history` endpoint, fetched
        // when the dropdown is opened. Re-enable the block below only if that
        // plan is abandoned — and add `attributes` and a limit if you do.
        //
        // {
        //   model: LeadHistory,
        //   as: 'History',
        //   separate: true, // IMPORTANT
        //   order: [['recorded_at', 'DESC']], // latest history first
        // }
      ]
    });

    res.status(200).json(buildPage({ rows, count, page, limit }));
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const getLeadMetrics = async (req, res) => {
  try {
    const { where, profileWhere } = await leadFilter.buildLeadQuery(req);

    // TOTAL LEADS (ALL)
    const total = await Lead.count({
      where,
      include: [
        {
          model: LeadProfile,
          as: "Profile",
          attributes: [],
          ...(profileWhere ? { where: profileWhere } : {})
        }
      ]
    });

    // GROUP BY STATUS
    const statusCounts = await Lead.findAll({
      attributes: [
        "status_id",
        [Sequelize.fn("COUNT", Sequelize.col("Lead.id")), "count"]
      ],
      where,
      include: [
        {
          model: LeadProfile,
          as: "Profile",
          attributes: [],
          ...(profileWhere ? { where: profileWhere } : {})
        }
      ],
      group: ["status_id"]
    });

    const statuses = {};

    statusCounts.forEach((row) => {
      statuses[row.status_id] = Number(row.dataValues.count);
    });

    res.status(200).json({
      total,
      statuses
    });

  } catch (error) {
    console.error("Lead metrics error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

const getFollowups = async (req, res) => {
  try {
    const {
      followup = 'today',
      agent_id,
    } = req.query;

    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 10 });
    const where = { is_deleted: false };

    await leadFilter.applyAgentScope(where, req.user, agent_id);

    const followupClause = leadFilter.getFollowUpClause(followup);
    if (!followupClause) {
      return res.status(400).json({ error: 'Invalid followup filter.' });
    }
    where.next_followup = followupClause;

    const { count, rows } = await Lead.findAndCountAll({
      where,
      limit,
      offset,
      order: getFollowupOrderClause(followup),
      include: [
        { model: LeadProfile, as: 'Profile' },
        { model: User, as: 'Agent', attributes: ['id', 'name'] },
        { model: Subsource, as: 'SubsourceConfig', attributes: ['id', 'label'] },
      ],
    });

    res.status(200).json(buildPage({ rows, count, page, limit }));
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const getFollowUpCounts = async (req, res) => {
  try {

    const { agent_ids } = req.query;

    const where = { is_deleted: false };

    await leadFilter.applyAgentScope(where, req.user, agent_ids);

    // ─── Date ranges ─────────────────────────

    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);

    const endOfToday = new Date();
    endOfToday.setHours(23,59,59,999);

    const overdue = await Lead.count({
      where: {
        ...where,
        next_followup: { [Op.lt]: startOfToday }
      }
    });

    const today = await Lead.count({
      where: {
        ...where,
        next_followup: {
          [Op.between]: [startOfToday, endOfToday]
        }
      }
    });

    const upcoming = await Lead.count({
      where: {
        ...where,
        next_followup: { [Op.gt]: endOfToday }
      }
    });

    res.json({
      overdue,
      today,
      upcoming
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch followup counts" });
  }
};

/**
 * Controller: Get single lead details
 */
const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await Lead.findOne({
      where: { id, is_deleted: false },
      include: [
        { model: LeadProfile, as: 'Profile' },
        { model: User, as: 'Agent', attributes: ['id', 'name'] },
        { model: Subsource, as: 'SubsourceConfig', attributes: ['id', 'label'] }
      ]
    });

    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    // Role check
    const leadAgentId = lead.agent_id ? lead.agent_id.toString() : null;
    if (req.user.role === 'Agent' && leadAgentId !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.status(200).json(lead);
  } catch (error) {
    console.error('Get lead details error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const DUPLICATE_MESSAGES = {
  Superadmin: "A lead with this phone number already exists in the system.",
  Manager: "This phone number is already registered. Please check the existing leads.",
  Agent: "A lead with this phone number already exists. Contact your manager if you think this is a mistake.",
};

/**
 * Controller: Handling lead creation with Deduplication and Re-entry
 */
const createLead = async (req, res) => {
  try {
    const actorId = req.user ? req.user.id : null;
    const role = req.user?.role ?? "Agent";

    const normalizedPhone = leadService.normalizePhone(req.body.phone);

    if (!normalizedPhone) {
      return res.status(400).json({ error: "A valid phone number is required." });
    }

    const existingProfile = await LeadProfile.findOne({
      where: { phone: normalizedPhone },
    });

    if (existingProfile) {
      return res.status(409).json({
        error: "DUPLICATE_LEAD",
        message: DUPLICATE_MESSAGES[role] ?? DUPLICATE_MESSAGES["Agent"],
      });
    }

    const result = await leadService.createOrProcessReentry(req.body, actorId, 'Manual');

    res.status(result.status === 'CREATED' ? 201 : 200).json({
      message: result.status === 'CREATED' ? 'Lead created successfully' : 'Lead re-entry processed successfully',
      lead: result.lead,
      profile: result.profile
    });
  } catch (error) {
    console.error('Create/Re-entry lead error:', error.message);
    res.status(400).json({ error: error.message || 'Internal server error.' });
  }
};

/**
 * Controller: Handling lead creation with Deduplication and Re-entry
 */

const CRM_TOKEN_SECRET = "PS_EXTERNAL_SECRET";
const CRM_TOKEN_EXPIRY = "1h";

const createExternalLead = async (req, res) => {
  try {
    const { external_source } = req.body;

    const result = await leadService.createOrProcessReentry(
      req.body,
      null,
      external_source || "External",
    );

    const crmToken = jwt.sign(
      {
        lead_id: result.lead.id,
        profile_id: result.profile.id,
        source: external_source || "External",
      },
      CRM_TOKEN_SECRET,
      { expiresIn: CRM_TOKEN_EXPIRY },
    );

    res.status(200).json({
      message: "Lead saved successfully",
      status: result.status,
      crmToken,
      expiresIn: 3600,
    });

  } catch (error) {
    console.error('External lead creation error:', error.message);
    res.status(400).json({ error: error.message || 'Internal server error.' });
  }
};

const verifyExternalLead = async (req, res) => {
  try {
    const { crmToken } = req.body;

    if (!crmToken) {
      return res.status(400).json({ error: "Token is required." });
    }

    let payload;
    try {
      payload = jwt.verify(crmToken, CRM_TOKEN_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    const profile = await LeadProfile.findByPk(payload.profile_id);

    if (!profile) {
      return res.status(404).json({ error: "Profile not found." });
    }

    // Already verified — no-op
    if (profile.phone_verified) {
      return res.status(200).json({ message: "Phone already verified." });
    }

    await profile.update({
      phone_verified: true,
      phone_verified_source: payload.source || "External",
    });

    res.status(200).json({ message: "Phone verified successfully." });
  } catch (error) {
    console.error("CRM verify error:", error.message);
    res.status(500).json({ error: "Internal server error." });
  }
};
/**
 * Controller: Update lead fields (profile fields go to profile, lead fields go to lead)
 */
const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const lead = await Lead.findOne({
      where: { id, is_deleted: false },
      include: [{ model: LeadProfile, as: 'Profile' }]
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    const profile = lead.Profile;
    const oldAgentId = lead.agent_id;

    // Role check for Lead Access
    const leadAgentId = lead.agent_id ? lead.agent_id.toString() : null;
    if (req.user.role === 'Agent' && leadAgentId !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (req.user.role === 'Manager') {
      const subordinates = await User.findAll({ where: { manager_id: req.user.id }, attributes: ['id'] });
      const teamIds = [req.user.id.toString(), ...subordinates.map(s => s.id.toString())];
      if (leadAgentId !== null && !teamIds.includes(leadAgentId)) {
        return res.status(403).json({ error: 'Access denied: You are not authorized to manage this lead.' });
      }
    }

    // Role check for Assignment
    if (updates.agent_id !== undefined) {
      if (req.user.role === 'Agent') {
        delete updates.agent_id;
      } else if (req.user.role === 'Manager') {
        const subordinates = await User.findAll({ where: { manager_id: req.user.id }, attributes: ['id'] });
        const teamIds = [req.user.id.toString(), ...subordinates.map(s => s.id.toString())];

        if (updates.agent_id && (updates.agent_id.toString().toLowerCase() === 'unassigned' || updates.agent_id === '')) {
          updates.agent_id = null;
        } else if (updates.agent_id) {
          updates.agent_id = updates.agent_id.toString().toLowerCase();
        }

        if (updates.agent_id !== null && !teamIds.includes(updates.agent_id.toString())) {
          return res.status(403).json({ error: 'Managers can only assign leads to their own team members.' });
        }
      } else if (req.user.role === 'Superadmin') {
        if (updates.agent_id && (updates.agent_id.toString().toLowerCase() === 'unassigned' || updates.agent_id === '')) {
          updates.agent_id = null;
        } else if (updates.agent_id) {
          updates.agent_id = updates.agent_id.toString().toLowerCase();
        }
      }
    }

    // Snapshot old values for change detection
    const oldStatusId = lead.status_id;
    const oldFollowup = lead.next_followup;
    const oldLossReason = lead.loss_reason;
    const oldName = profile.name;
    const oldEmail = profile.email;
    const oldPhone = profile.phone;
    const oldProductId = lead.product_id;
    const oldSubsourceId = lead.subsource_id;

    // ── Split updates: profile fields vs lead fields ──
    const profileUpdates = {};
    const profileFieldChanges = [];

    if (updates.name !== undefined && updates.name !== oldName) {
      profileUpdates.name = updates.name;
      profileUpdates.name_history = [...new Set([...(profile.name_history || []), updates.name])];
      profileFieldChanges.push(`name: "${oldName}" → "${updates.name}"`);
      delete updates.name;
    } else {
      delete updates.name;
    }

    if (updates.email !== undefined && updates.email !== oldEmail) {
      profileUpdates.email = updates.email;
      profileUpdates.email_history = [...new Set([...(profile.email_history || []), updates.email].filter(Boolean))];
      profileFieldChanges.push(`email: "${oldEmail || ''}" → "${updates.email || ''}"`);
      delete updates.email;
    } else {
      delete updates.email;
    }

    if (updates.phone !== undefined && updates.phone !== oldPhone) {
      const normalizedPhone = leadService.normalizePhone(updates.phone);
      profileUpdates.phone = normalizedPhone;
      profileFieldChanges.push(`phone: "${oldPhone}" → "${normalizedPhone}"`);
      delete updates.phone;
    } else {
      delete updates.phone;
    }

    if (updates.country_code !== undefined) {
      profileUpdates.country_code = updates.country_code;
      delete updates.country_code;
    }

    // Apply profile updates
    if (Object.keys(profileUpdates).length > 0) {
      await profile.update(profileUpdates);
    }

    // Build lead-level updates (remove profile fields already handled)
    const leadUpdates = {};
    const leadFields = ['product_id', 'subsource_id', 'status_id', 'loss_reason', 'next_followup',
      'agent_id', 'extra_fields', 'utm_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
    for (const field of leadFields) {
      if (updates[field] !== undefined) {
        leadUpdates[field] = updates[field];
      }
    }

    // Track Assignment Change
    const normalizedNewAgentId = leadUpdates.agent_id ? leadUpdates.agent_id.toString() : null;
    const normalizedOldAgentId = oldAgentId ? oldAgentId.toString() : null;
    const agentChanged =
      leadUpdates.agent_id !== undefined && normalizedNewAgentId !== normalizedOldAgentId;

    if (agentChanged) {
      leadUpdates.assigned_at = leadUpdates.agent_id ? new Date() : null;
    }

    if (Object.keys(leadUpdates).length > 0) {
      await lead.update(leadUpdates);
    }

    if (agentChanged) {
      const newAgent = leadUpdates.agent_id ? await User.findByPk(leadUpdates.agent_id) : null;
      const oldAgent = oldAgentId ? await User.findByPk(oldAgentId) : null;
      await Activity.create({
        lead_id: lead.id,
        profile_id: profile.id,
        type: 'Assignment',
        title: 'Lead Reassigned',
        details: `Reassigned from ${oldAgent ? oldAgent.name : 'Unassigned Pool'} to ${newAgent ? newAgent.name : 'Unassigned Pool'}`,
        actor_id: req.user.id,
        metadata: {
          source: 'Manual',
          updated_by: req.user.id,
          old: { agent_id: oldAgentId, agent_name: oldAgent ? oldAgent.name : null },
          new: { agent_id: leadUpdates.agent_id, agent_name: newAgent ? newAgent.name : null },
        }
      });

      // Ownership is per-PERSON, not per-lead: one profile may hold leads across
      // several products, and two agents calling the same person is the bug this
      // avoids. Sync every other lead on this profile to the new agent, matching
      // what bulk update and re-entry intake already do. This lead is skipped
      // inside the cascade since it already carries the new agent.
      await leadService.cascadeAgentToProfileLeads(
        profile.id,
        leadUpdates.agent_id ?? null,
        req.user.id,
        undefined,
        'Manual',
        'Single lead reassigned',
      );
    }

    if (leadUpdates.status_id && leadUpdates.status_id !== oldStatusId) {
      // Resolve status labels for activity metadata
      const oldStatusObj = await Status.findByPk(oldStatusId);
      const newStatusObj = await Status.findByPk(leadUpdates.status_id);
      const oldStatusLabel = oldStatusObj ? oldStatusObj.label : oldStatusId;
      const newStatusLabel = newStatusObj ? newStatusObj.label : leadUpdates.status_id;

      await Activity.create({
        lead_id: lead.id,
        profile_id: profile.id,
        type: 'StatusChange',
        title: 'Status Updated',
        details: `Status changed from "${oldStatusLabel}" to "${newStatusLabel}"${leadUpdates.loss_reason ? ` — Reason: ${leadUpdates.loss_reason}` : ''}`,
        actor_id: req.user.id,
        metadata: {
          source: 'Manual',
          updated_by: req.user.id,
          old: { status_id: oldStatusId, status_label: oldStatusLabel, loss_reason: oldLossReason || null },
          new: { status_id: leadUpdates.status_id, status_label: newStatusLabel, loss_reason: leadUpdates.loss_reason || null },
        }
      });
    }

    if (leadUpdates.next_followup !== undefined && String(leadUpdates.next_followup) !== String(oldFollowup)) {
      await Activity.create({
        lead_id: lead.id,
        profile_id: profile.id,
        type: 'FollowUp',
        title: 'Follow-up Updated',
        details: leadUpdates.next_followup
          ? `Follow-up set to ${new Date(leadUpdates.next_followup).toLocaleString()}`
          : 'Follow-up cleared',
        actor_id: req.user.id,
        metadata: {
          source: 'Manual',
          updated_by: req.user.id,
          old: { next_followup: oldFollowup },
          new: { next_followup: leadUpdates.next_followup },
        }
      });
    }

    if (leadUpdates.loss_reason !== undefined && leadUpdates.loss_reason !== oldLossReason && !(leadUpdates.status_id && leadUpdates.status_id !== oldStatusId)) {
      await Activity.create({
        lead_id: lead.id,
        profile_id: profile.id,
        type: 'StatusChange',
        title: 'Loss Reason Updated',
        details: `Loss reason set to "${leadUpdates.loss_reason || '(cleared)'}"`,
        actor_id: req.user.id,
        metadata: {
          source: 'Manual',
          updated_by: req.user.id,
          old: { loss_reason: oldLossReason },
          new: { loss_reason: leadUpdates.loss_reason },
        }
      });
    }

    // Track general field updates
    const fieldChanges = [...profileFieldChanges];
    if (leadUpdates.product_id !== undefined && leadUpdates.product_id !== oldProductId) fieldChanges.push(`product: "${oldProductId}" → "${leadUpdates.product_id}"`);
    if (leadUpdates.subsource_id !== undefined && leadUpdates.subsource_id !== oldSubsourceId) fieldChanges.push(`subsource: "${oldSubsourceId || ''}" → "${leadUpdates.subsource_id || ''}"`);
    if (leadUpdates.extra_fields !== undefined) fieldChanges.push('extra_fields updated');

    if (fieldChanges.length > 0) {
      await Activity.create({
        lead_id: lead.id,
        profile_id: profile.id,
        type: 'Audit',
        title: 'Lead Details Updated',
        details: fieldChanges.join('; '),
        actor_id: req.user.id,
        metadata: {
          source: 'Manual',
          updated_by: req.user.id,
          changes: fieldChanges,
        }
      });
    }

    // Reload with profile
    await lead.reload({ include: [{ model: LeadProfile, as: 'Profile' }] });
    res.status(200).json(lead);
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Controller: Bulk Update Leads
 */
const bulkUpdateLeads = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { ids, updates } = req.body;

    if (!ids || !Array.isArray(ids)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'IDs array required.' });
    }

    const allowedUpdates = {};
    if (updates.status_id) allowedUpdates.status_id = updates.status_id;
    if (updates.agent_id !== undefined) allowedUpdates.agent_id = updates.agent_id;

    if (Object.keys(allowedUpdates).length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    if (allowedUpdates.agent_id !== undefined) {
      if (req.user.role === 'Agent') {
        await transaction.rollback();
        return res.status(403).json({ error: 'Agents cannot reassign leads.' });
      } else if (req.user.role === 'Manager' || req.user.role === 'Superadmin') {
        if (allowedUpdates.agent_id && (allowedUpdates.agent_id.toString().toLowerCase() === 'unassigned' || allowedUpdates.agent_id === '')) {
          allowedUpdates.agent_id = null;
        } else if (allowedUpdates.agent_id) {
          allowedUpdates.agent_id = allowedUpdates.agent_id.toString().toLowerCase();
        }

        if (req.user.role === 'Manager' && allowedUpdates.agent_id !== null) {
          const subordinates = await User.findAll({ where: { manager_id: req.user.id }, attributes: ['id'] });
          const teamIds = [req.user.id.toString(), ...subordinates.map(s => s.id.toString())];
          if (!teamIds.includes(allowedUpdates.agent_id.toString())) {
            await transaction.rollback();
            return res.status(403).json({ error: 'Managers can only assign leads to their own team members.' });
          }
        }
      }
    }

    const leads = await Lead.findAll({
      where: { id: { [Op.in]: ids }, is_deleted: false },
      include: [{ model: LeadProfile, as: 'Profile', attributes: ['id'] }],
      transaction,
    });

    let newAgent = null;
    if (allowedUpdates.agent_id) {
      newAgent = await User.findByPk(allowedUpdates.agent_id, { attributes: ['id', 'name'], transaction });
    }

    for (const lead of leads) {
      if (req.user.role === 'Manager') {
        const subordinates = await User.findAll({ where: { manager_id: req.user.id }, attributes: ['id'] });
        const teamIds = [req.user.id.toString(), ...subordinates.map(s => s.id.toString())];
        const leadAgentId = lead.agent_id ? lead.agent_id.toString() : null;
        if (leadAgentId !== null && !teamIds.includes(leadAgentId)) continue;
      }

      const oldAgentId = lead.agent_id;
      const oldStatusId = lead.status_id;

      // Stamp assigned_at when this row's agent actually changes
      const oldAgentStr = oldAgentId ? oldAgentId.toString() : null;
      const newAgentStr = allowedUpdates.agent_id
        ? allowedUpdates.agent_id.toString()
        : (allowedUpdates.agent_id === null ? null : oldAgentStr);
      const rowAgentChanged =
        allowedUpdates.agent_id !== undefined && newAgentStr !== oldAgentStr;

      const rowPatch = rowAgentChanged
        ? { ...allowedUpdates, assigned_at: allowedUpdates.agent_id ? new Date() : null }
        : allowedUpdates;

      await lead.update(rowPatch, { transaction });

      if (allowedUpdates.agent_id !== undefined) {
        const normalizedOld = oldAgentId ? oldAgentId.toString() : null;
        const normalizedNew = allowedUpdates.agent_id ? allowedUpdates.agent_id.toString() : null;
        if (normalizedNew !== normalizedOld) {
          let oldAgent = null;
          if (oldAgentId) {
            oldAgent = await User.findByPk(oldAgentId, { attributes: ['id', 'name'] });
          }

          // Cascade agent to all other leads on the same profile
          if (lead.Profile?.id) {
            const siblingLeads = await Lead.findAll({
              where: {
                profile_id: lead.Profile.id,
                id: { [Op.ne]: lead.id },
                is_deleted: false,
              },
              transaction,
            });

            // Collect all unique old agent IDs in one go
            const uniqueOldAgentIds = [
              ...new Set(
                siblingLeads
                  .map(s => s.agent_id)
                  .filter(id => id && id.toString() !== normalizedNew)
              )
            ];

            // Single batch query instead of one per sibling
            const oldAgentsMap = {};
            if (uniqueOldAgentIds.length > 0) {
              const oldAgents = await User.findAll({
                where: { id: { [Op.in]: uniqueOldAgentIds } },
                attributes: ['id', 'name'],
                transaction,
              });
              oldAgents.forEach(a => { oldAgentsMap[a.id.toString()] = a; });
            }

            for (const sibling of siblingLeads) {
              const siblingAgentStr = sibling.agent_id?.toString() ?? null;
              if (siblingAgentStr === normalizedNew) continue;

              const siblingOldAgentId = sibling.agent_id ?? null;
              const siblingOldAgent = siblingOldAgentId
                ? oldAgentsMap[siblingOldAgentId.toString()] ?? null
                : null;

              await sibling.update(
                {
                  agent_id: allowedUpdates.agent_id,
                  assigned_at: allowedUpdates.agent_id ? new Date() : null,
                },
                { transaction },
              );

              await Activity.create({
                lead_id: sibling.id,
                profile_id: lead.Profile.id,
                type: 'Assignment',
                title: 'Lead Reassigned',
                details: `Agent changed from ${siblingOldAgent?.name || 'Unassigned'} to ${newAgent?.name || 'Unassigned'} (cascaded from bulk update)`,
                actor_id: req.user.id,
                metadata: {
                  source: 'Bulk Update',
                  cascaded: true,                                      
                  cascade_reason: `Bulk update on lead`,
                  updated_by: req.user.id,
                  cascaded_from_lead_id: lead.id,
                  old: { agent_id: siblingOldAgentId, agent_name: siblingOldAgent?.name || null },
                  new: { agent_id: allowedUpdates.agent_id, agent_name: newAgent?.name || null },
                },
              }, { transaction });
            }
          }


          await Activity.create({
            lead_id: lead.id,
            profile_id: lead.Profile ? lead.Profile.id : null,
            type: 'Assignment',
            title: 'Lead Reassigned',
            details: `Reassigned from ${oldAgent ? oldAgent.name : 'Unassigned Pool'} to ${newAgent ? newAgent.name : 'Unassigned Pool'}`,
            actor_id: req.user.id,
            metadata: {
              source: 'Bulk Update',
              updated_by: req.user.id,
              batch_size: ids.length,
              old: { agent_id: oldAgentId, agent_name: oldAgent ? oldAgent.name : null },
              new: { agent_id: allowedUpdates.agent_id, agent_name: newAgent ? newAgent.name : null },
            }
          }, { transaction });
        }
      }

      if (allowedUpdates.status_id && allowedUpdates.status_id !== oldStatusId) {
        // Resolve status labels
        const oldStatusObj = await Status.findByPk(oldStatusId, { transaction });
        const newStatusObj = await Status.findByPk(allowedUpdates.status_id, { transaction });
        const oldStatusLabel = oldStatusObj ? oldStatusObj.label : oldStatusId;
        const newStatusLabel = newStatusObj ? newStatusObj.label : allowedUpdates.status_id;

        await Activity.create({
          lead_id: lead.id,
          profile_id: lead.Profile ? lead.Profile.id : null,
          type: 'StatusChange',
          title: 'Status Updated',
          details: `Status changed from "${oldStatusLabel}" to "${newStatusLabel}"`,
          actor_id: req.user.id,
          metadata: {
            source: 'Bulk Update',
            updated_by: req.user.id,
            batch_size: ids.length,
            old: { status_id: oldStatusId, status_label: oldStatusLabel },
            new: { status_id: allowedUpdates.status_id, status_label: newStatusLabel },
          }
        }, { transaction });
      }
    }

    await transaction.commit();
    res.status(200).json({ message: `Successfully updated ${leads.length} leads.` });
  } catch (error) {
    await transaction.rollback();
    console.error('Bulk update error:', error?.message || error, error?.stack);
    res.status(500).json({ error: error?.message || 'Internal server error.' });
  }
};

/**
 * Controller: Soft Delete lead (Superadmin only)
 */
const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await Lead.findOne({
      where: { id },
      include: [{ model: LeadProfile, as: 'Profile', attributes: ['id', 'name', 'phone'] }]
    });

    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    await lead.update({ is_deleted: true });

    await Activity.create({
      lead_id: lead.id,
      profile_id: lead.Profile ? lead.Profile.id : null,
      type: 'Audit',
      title: 'Lead Deleted',
      details: `Lead soft-deleted by ${req.user ? req.user.name || req.user.id : 'system'}.`,
      actor_id: req.user ? req.user.id : null,
      metadata: {
        source: 'Manual',
        deleted_by: req.user ? req.user.id : null,
        lead_snapshot: {
          profile_name: lead.Profile?.name,
          profile_phone: lead.Profile?.phone,
          product_id: lead.product_id,
          agent_id: lead.agent_id,
        },
      }
    });

    res.status(200).json({ message: 'Lead successfully deleted.' });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// ═══════════════════════════════════════════
// NOTES (replaces conversation endpoints)
// ═══════════════════════════════════════════

/**
 * Bump a lead's updated_at so the "Modified Date" column reflects note activity.
 * Notes live in their own table, so writing one leaves the Lead row untouched —
 * marking the timestamp dirty is what forces Sequelize to issue the UPDATE.
 */
const touchLead = async (leadOrId) => {
  const lead =
    typeof leadOrId === 'string' ? await Lead.findByPk(leadOrId) : leadOrId;
  if (!lead) return;

  lead.changed('updatedAt', true);
  await lead.save({ fields: ['updatedAt'] });
};

const addNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, type = 'Note', sender, metadata } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const lead = await Lead.findOne({
      where: { id, is_deleted: false },
      include: [{ model: LeadProfile, as: 'Profile', attributes: ['id'] }]
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const note = await LeadNote.create({
      lead_id: lead.id,
      profile_id: lead.Profile.id,
      actor_id: req.user ? req.user.id : null,
      type,
      content,
      metadata: { ...metadata, sender },
    });

    await Activity.create({
      lead_id: lead.id,
      profile_id: lead.Profile.id,
      type: 'Note',
      title: type === 'Conversation' ? 'Conversation Message Added' : 'Note Added',
      details: content,
      actor_id: req.user ? req.user.id : null,
      metadata: { source: 'Manual', note_id: note.id, note_type: type, sender },
    });

    await touchLead(lead);

    res.status(201).json({ message: 'Note added successfully', note });
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getNotes = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    const lead = await Lead.findOne({ where: { id, is_deleted: false } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const where = { lead_id: id };
    if (type) where.type = type;

    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });

    const { count, rows } = await LeadNote.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      include: [
        { model: User, as: 'Actor', attributes: ['id', 'name'] }
      ]
    });

    res.status(200).json(buildPage({ rows, count, page, limit }));
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Controller: Get ALL notes across the profile (all leads for this person)
 */
const getProfileNotes = async (req, res) => {
  try {
    const { id } = req.params; // lead id
    const { type } = req.query;

    const lead = await Lead.findOne({
      where: { id, is_deleted: false },
      include: [{ model: LeadProfile, as: 'Profile', attributes: ['id'] }],
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const profileId = lead.Profile.id;

    const where = { profile_id: profileId };
    if (type) where.type = type;

    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });

    const { count, rows } = await LeadNote.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      include: [
        { model: User, as: 'Actor', attributes: ['id', 'name'] },
        {
          model: Lead, as: 'Lead',
          attributes: ['id', 'product_id'],
          include: [{ model: Product, as: 'ProductConfig', attributes: ['id', 'label'] }],
        },
      ],
    });

    res.status(200).json(buildPage({ rows, count, page, limit }));
  } catch (error) {
    console.error('Get profile notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { content } = req.body;

    const note = await LeadNote.findByPk(noteId);
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const oldContent = note.content;
    await note.update({
      content,
      metadata: { ...note.metadata, edited_at: new Date() },
    });

    await Activity.create({
      lead_id: note.lead_id,
      profile_id: note.profile_id,
      type: 'Note',
      title: note.type === 'Conversation' ? 'Conversation Message Edited' : 'Note Edited',
      details: content,
      actor_id: req.user ? req.user.id : null,
      metadata: { source: 'Manual', note_id: noteId, action: 'edited', old_content: oldContent },
    });

    await touchLead(note.lead_id);

    res.status(200).json({ message: 'Note updated successfully', note });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteNote = async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await LeadNote.findByPk(noteId);
    if (!note) return res.status(404).json({ error: 'Note not found' });

    await Activity.create({
      lead_id: note.lead_id,
      profile_id: note.profile_id,
      type: 'Note',
      title: note.type === 'Conversation' ? 'Conversation Message Deleted' : 'Note Deleted',
      details: note.content,
      actor_id: req.user ? req.user.id : null,
      metadata: { source: 'Manual', note_id: noteId, action: 'deleted', note_type: note.type },
    });

    const leadId = note.lead_id;
    await note.destroy();

    await touchLead(leadId);

    res.status(200).json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Controller: Get activity log for a lead
 */
const getLeadActivities = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    const lead = await Lead.findOne({ where: { id, is_deleted: false } });
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    if (req.user.role === 'Agent' && lead.agent_id?.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const where = { lead_id: id };
    if (type) where.type = type;

    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });

    const { count, rows } = await Activity.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      include: [
        { model: User, as: 'Actor', attributes: ['id', 'name', 'role'] }
      ]
    });

    res.status(200).json(buildPage({ rows, count, page, limit }));
  } catch (error) {
    console.error('Get lead activities error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

/**
 * Controller: Re-entry report — list of re-entry events for superadmin/manager
 */
const getReentryReport = async (req, res) => {
  try {
    const { date_from, date_to, product, agent_id } = req.query;
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });

    const where = {
      type: 'System',
      title: { [Op.iLike]: '%Re-entered%' },
    };

    leadFilter.applyDateRange(where, { date_from, date_to, date_field: 'created_at' });

    const leadWhere = { is_deleted: false };
    if (product) leadWhere.product_id = { [Op.in]: product.split(',') };
    if (agent_id) {
      if (agent_id.toLowerCase() === 'unassigned') {
        leadWhere.agent_id = null;
      } else {
        leadWhere.agent_id = agent_id.toLowerCase();
      }
    }

    // Manager scoping
    if (req.user.role === 'Manager') {
      const subordinates = await User.findAll({ where: { manager_id: req.user.id }, attributes: ['id'] });
      const teamIds = [req.user.id.toLowerCase(), ...subordinates.map(s => s.id.toString().toLowerCase())];
      leadWhere[Op.or] = [
        { agent_id: { [Op.in]: teamIds } },
        { agent_id: null }
      ];
    }

    const { count, rows } = await Activity.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: Lead, as: 'Lead',
          where: leadWhere,
          attributes: ['id', 'product_id', 'agent_id', 'status_id'],
          include: [
            { model: User, as: 'Agent', attributes: ['id', 'name'] },
            { model: Product, as: 'ProductConfig', attributes: ['id', 'label'] },
          ]
        },
        {
          model: LeadProfile, as: 'Profile',
          attributes: ['id', 'name', 'phone', 'email', 'intent'],
        },
        { model: User, as: 'Actor', attributes: ['id', 'name', 'role'] },
      ],
    });

    res.status(200).json(buildPage({ rows, count, page, limit }));
  } catch (error) {
    console.error('Re-entry report error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};


module.exports = {
  getLeadIdsFromHistory,
  getLeads,
  getLeadById,
  createLead,
  createExternalLead,
  verifyExternalLead,
  getFollowups,
  getFollowUpCounts,
  updateLead,
  deleteLead,
  bulkUpdateLeads,
  getLeadActivities,
  addNote,
  getNotes,
  getProfileNotes,
  updateNote,
  deleteNote,
  getReentryReport,
  getLeadMetrics,
};
