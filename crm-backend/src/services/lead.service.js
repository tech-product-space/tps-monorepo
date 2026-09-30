const {
  Lead,
  LeadProfile,
  LeadHistory,
  User,
  Product,
  Activity,
  Subsource,
  sequelize,
} = require("../models");
const { Op } = require("sequelize");
const resolveTime = require("../utils/helper/resolveTime");

/**
 * Stamp for leads.assigned_at: now when an agent is set, null when unassigned.
 */
const assignedAtFor = (agentId) => (agentId ? new Date() : null);

/**
 * Normalize a phone number to digits only for deduplication matching.
 */
const normalizePhone = (phone) => {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
};

/**
 * Helper: add a value to a JSONB array if not already present
 */
const addUniqueToArray = (arr, val) => {
  if (!val) return arr || [];
  const list = Array.isArray(arr) ? [...arr] : [];
  if (!list.includes(val)) list.push(val);
  return list;
};

/**
 * Helper: take any mixed list and return an ordered array of unique, trimmed strings
 */
const toUniqueStringList = (list) => {
  const seen = new Set();
  const normalized = [];

  (Array.isArray(list) ? list : []).forEach((entry) => {
    if (entry === null || entry === undefined) return;
    const value = typeof entry === "string" ? entry.trim() : String(entry);
    if (!value || seen.has(value)) return;
    seen.add(value);
    normalized.push(value);
  });

  return normalized;
};

/**
 * Helper: resolve product by id with fuzzy fallback
 */
const resolveProduct = async (product_id, transaction) => {
  const productKey = product_id ? product_id.trim() : "General Inquiry";
  // paranoid:false so ingestion (Meta cron / webhook / import) still resolves an
  // ARCHIVED product and attaches the lead to it, instead of silently falling
  // back to "General Inquiry". Machine writes ignore soft-delete; human reads
  // respect it. The product stays archived — see product settings for the count.
  let product = await Product.findByPk(productKey, { transaction, paranoid: false });

  if (!product) {
    const allProducts = await Product.findAll({ transaction, paranoid: false });
    const san = (str) => str.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    product = allProducts.find((p) => san(p.label) === san(productKey));
  }

  if (!product) {
    product = await Product.findByPk("General Inquiry", { transaction, paranoid: false });
  }

  if (!product) {
    throw new Error(
      `Product "${product_id}" not found and no fallback available.`,
    );
  }

  return product;
};

/**
 * Fields we snapshot into lead_history.
 * Mirrors the lead_history table columns exactly.
 */
const HISTORY_FIELDS = [
  "profile_id",
  "product_id",
  "subsource_id",
  "utm_id",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "extra_fields",
  "additional_data",
  "source_created_at",
];

/**
 * NOTE: a `hasHistoryRelevantChange` gate used to sit here. It suppressed the
 * `reentry_same_product` history row whenever a resubmitted form carried no
 * new field values, which made lead_history an incomplete log of arrivals.
 * An identical resubmit is still a real re-engagement, and the lead
 * acquisition board counts arrivals — so every suppressed row was inflow the
 * source never got credit for. History rows are now written unconditionally,
 * matching the new-product branch, which never gated.
 */

/**
 * Write a snapshot row to lead_history.
 * Pulls field values directly from the lead instance.
 */
const recordHistory = async ({
  lead,
  actorId,
  changeType,
  source,
  transaction,
}) => {
  const snapshot = HISTORY_FIELDS.reduce((acc, field) => {
    acc[field] = lead[field] ?? null;
    return acc;
  }, {});

  await LeadHistory.create(
    {
      lead_id: lead.id,
      ...snapshot,
      changed_by: actorId || null,
      change_type: changeType,
      source: source || null,
      recorded_at: new Date(),
    },
    { transaction },
  );
};

const cascadeAgentToProfileLeads = async (
  profileId,
  newAgentId,
  actorId,
  transaction,
  source = "Manual",
  cascadeReason = null,
) => {
  const leads = await Lead.findAll({
    where: { profile_id: profileId, is_deleted: false },
    transaction,
  });

  const newAgent = newAgentId
    ? await User.findByPk(newAgentId, {
        attributes: ["id", "name"],
        transaction,
      })
    : null;

  for (const lead of leads) {
    if (lead.agent_id?.toString() === newAgentId?.toString()) continue;

    const oldAgentId = lead.agent_id ?? null;
    const oldAgent = oldAgentId
      ? await User.findByPk(oldAgentId, {
          attributes: ["id", "name"],
          transaction,
        })
      : null;

    await lead.update(
      { agent_id: newAgentId, assigned_at: assignedAtFor(newAgentId) },
      { transaction },
    );

    await Activity.create(
      {
        lead_id: lead.id,
        profile_id: profileId,
        actor_id: actorId || null,
        type: "Assignment",
        title: "Lead Reassigned",
        details: `Agent changed from ${oldAgent?.name || "Unassigned"} to ${newAgent?.name || "Unassigned"}`,
        metadata: {
          source,
          cascaded: true,
          cascade_reason: cascadeReason,
          old: { agent_id: oldAgentId, agent_name: oldAgent?.name || null },
          new: { agent_id: newAgentId, agent_name: newAgent?.name || null },
        },
      },
      { transaction },
    );
  }
};

const createOrProcessReentry = async (leadData, actorId, source = "Manual") => {
  const transaction = await sequelize.transaction();

  try {
    const {
      name,
      phone,
      email,
      country_code,
      extra_fields,
      additional_data,
      product_id,
      subsource_id,
      subsource,
      utm_id,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      source_created_at,
      agent_id,
    } = leadData;

    // 1. Normalize phone
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      throw new Error("A valid phone number is required.");
    }

    // 2. Resolve product
    const requestedProduct = await resolveProduct(product_id, transaction);

    // 3. Resolve subsource
    let resolvedSubsourceId = subsource_id || null;
    let subsourceLabel = subsource ?? null;

    if (!resolvedSubsourceId && subsource) {
      const found = await Subsource.findOne({
        where: { label: subsource, product_id: requestedProduct.id },
        transaction,
        paranoid: false, // ingestion attaches to archived subsources too (see resolveProduct)
      });
      if (found) {
        resolvedSubsourceId = found.id;
        subsourceLabel = found?.label || null;
      }
    }

    // 4. Fetch actor for role-based assignment
    const actor = actorId
      ? await User.findByPk(actorId, { transaction })
      : null;

    // 5. Find existing profile by phone
    const existingProfile = await LeadProfile.findOne({
      where: { phone: normalizedPhone },
      transaction,
    });

    // ═══════════════════════════════════════════
    // CASE A: NEW PROFILE + NEW LEAD
    // ═══════════════════════════════════════════
    if (!existingProfile) {
      // Determine agent
      const agentExplicitlyProvided = "agent_id" in leadData;
      let finalAgentId;
      if (agentExplicitlyProvided) {
        finalAgentId = leadData.agent_id ?? null;
      } else if (actor?.role === "Agent") {
        finalAgentId = actor.id;
      } else {
        finalAgentId = requestedProduct.assigned_manager_id || null;
      }

      // Create profile
      const profile = await LeadProfile.create(
        {
          name: name || "Anonymous",
          email,
          phone: normalizedPhone,
          country_code: country_code || "+91",
          intent: requestedProduct.intent_tier || "Low",
          name_history: name ? [name] : [],
          email_history: email ? [email] : [],
          interested_products: [requestedProduct.id],
        },
        { transaction },
      );

      const sourceCreatedAt = resolveTime(
        leadData.source_created_at ??
          extra_fields?.timeStamp ??
          extra_fields?.timestamp ??
          extra_fields?.created_time,
        new Date(),
      );

      // Create lead
      const newLead = await Lead.create(
        {
          profile_id: profile.id,
          product_id: requestedProduct.id,
          subsource_id: resolvedSubsourceId,
          status_id: "s_new",
          lead_update_date: new Date(),
          agent_id: finalAgentId,
          assigned_at: assignedAtFor(finalAgentId),
          extra_fields,
          additional_data,
          utm_id,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_content,
          source_created_at: sourceCreatedAt,
        },
        { transaction },
      );

      await Activity.create(
        {
          lead_id: newLead.id,
          profile_id: profile.id,
          actor_id: actorId || null,
          type: "System",
          title: "New Lead Created",
          details: finalAgentId
            ? `Lead captured via ${source} and assigned to ${finalAgentId === actorId ? "creating agent" : "manager"}.`
            : `Lead captured via ${source} (Unassigned).`,
          metadata: {
            source,
            product_id: requestedProduct.id,
            product_label: requestedProduct.label,
            subsource_id: resolvedSubsourceId,
            subsource_label: subsourceLabel,
            agent_id: finalAgentId,
            phone: normalizedPhone,
          },
        },
        { transaction },
      );

      // History: first snapshot for this lead
      await recordHistory({
        lead: newLead,
        actorId,
        changeType: "created",
        source,
        transaction,
      });

      await transaction.commit();

      // Attach profile to lead for response
      newLead.dataValues.Profile = profile;
      return { lead: newLead, profile, status: "CREATED" };
    }

    // ═══════════════════════════════════════════
    // CASE B: EXISTING PROFILE → RE-ENTRY
    // ═══════════════════════════════════════════

    // Update profile fields
    const updatedProfileFields = {};

    // Append to history arrays
    updatedProfileFields.name_history = addUniqueToArray(
      existingProfile.name_history,
      name,
    );
    updatedProfileFields.email_history = addUniqueToArray(
      existingProfile.email_history,
      email,
    );

    // Add product to interested_products (preserve order, ensure uniqueness)
    const normalizedProductId =
      typeof requestedProduct.id === "string"
        ? requestedProduct.id.trim()
        : requestedProduct.id
          ? String(requestedProduct.id)
          : null;

    const updatedProducts = toUniqueStringList(
      existingProfile.interested_products,
    );

    if (normalizedProductId && !updatedProducts.includes(normalizedProductId)) {
      updatedProducts.push(normalizedProductId);
    }

    updatedProfileFields.interested_products = updatedProducts;

    // Intent upgrade: if new product is High and profile is Low → upgrade
    if (
      requestedProduct.intent_tier === "High" &&
      existingProfile.intent === "Low"
    ) {
      updatedProfileFields.intent = "High";
    }

    await existingProfile.update(updatedProfileFields, { transaction });

    // Determine agent from existing leads for this profile
    const existingLeads = await Lead.findAll({
      where: { profile_id: existingProfile.id, is_deleted: false },
      order: [["lead_update_date", "DESC"]],
      transaction,
    });

    // Derive current profile agent from most recently updated lead
    const currentProfileAgent =
      existingLeads.find((l) => l.agent_id)?.agent_id || null;

    // Resolve final agent — gate on key presence so explicit null is respected
    const agentExplicitlyProvided = "agent_id" in leadData;
    let finalAgentId;

    if (agentExplicitlyProvided) {
      // Intentional override — cascade will sync all leads
      finalAgentId = leadData.agent_id ?? null;
    } else if (currentProfileAgent) {
      // Profile already has an agent — preserve it
      finalAgentId = currentProfileAgent;
    } else {
      // No agent on profile yet — run fallback chain
      if (actor?.role === "Agent") {
        finalAgentId = actor.id;
      } else {
        finalAgentId = requestedProduct.assigned_manager_id || null;
      }
    }

    const agentChanged =
      finalAgentId?.toString() !== currentProfileAgent?.toString();

    // Check if there's an existing active lead for this profile + product
    const existingLeadForProduct = existingLeads.find(
      (l) => l.product_id === requestedProduct.id,
    );

    let lead;

    if (existingLeadForProduct) {
      // ─── SAME PRODUCT RE-ENTRY: update existing lead ───

      // Cascade agent to all profile leads if changed
      if (agentChanged) {
        await cascadeAgentToProfileLeads(
          existingProfile.id,
          finalAgentId,
          actorId,
          transaction,
          source,
          `Same product re-entry: "${requestedProduct.label}"`,
        );
      }

      const oldSnapshot = {
        status_id: existingLeadForProduct.status_id,
        agent_id: existingLeadForProduct.agent_id,
        subsource_id: existingLeadForProduct.subsource_id,
        extra_fields: existingLeadForProduct.extra_fields,
        additional_data: existingLeadForProduct.additional_data,
        utm_id: existingLeadForProduct.utm_id,
        utm_source: existingLeadForProduct.utm_source,
        utm_medium: existingLeadForProduct.utm_medium,
        utm_campaign: existingLeadForProduct.utm_campaign,
        utm_content: existingLeadForProduct.utm_content,
      };

      const mergedExtraFields = extra_fields
        ? { ...existingLeadForProduct.extra_fields, ...extra_fields }
        : existingLeadForProduct.extra_fields;
      const mergedAdditionalData = additional_data
        ? { ...existingLeadForProduct.additional_data, ...additional_data }
        : existingLeadForProduct.additional_data;

      await existingLeadForProduct.update(
        {
          status_id: "s_reentry",
          subsource_id:
            resolvedSubsourceId || existingLeadForProduct.subsource_id,
          lead_update_date: new Date(),
          extra_fields: mergedExtraFields,
          additional_data: mergedAdditionalData,
          utm_id: utm_id ?? existingLeadForProduct.utm_id,
          utm_source: utm_source ?? existingLeadForProduct.utm_source,
          utm_medium: utm_medium ?? existingLeadForProduct.utm_medium,
          utm_campaign: utm_campaign ?? existingLeadForProduct.utm_campaign,
          utm_content: utm_content ?? existingLeadForProduct.utm_content,
        },
        { transaction },
      );

      lead = existingLeadForProduct;

      await Activity.create(
        {
          lead_id: lead.id,
          profile_id: existingProfile.id,
          actor_id: actorId || null,
          type: "System",
          title: "Lead Re-entered (Same Product)",
          details: `Re-entered via ${source} for same product: "${requestedProduct.label}".`,
          metadata: {
            source,
            re_entry_type: "same_product",
            product_id: requestedProduct.id,
            old: oldSnapshot,
            new: {
              status_id: "s_reentry",
              agent_id: finalAgentId,
              subsource_id:
                resolvedSubsourceId || existingLeadForProduct.subsource_id,
              subsource_label: subsourceLabel,
              extra_fields: mergedExtraFields,
              additional_data: mergedAdditionalData,
            },
          },
        },
        { transaction },
      );

      // Always recorded — every arrival is a countable acquisition event,
      // whether or not the payload differed from last time.
      await recordHistory({
        lead,
        actorId,
        changeType: "reentry_same_product",
        source,
        transaction,
      });
    } else {
      // ─── DIFFERENT PRODUCT RE-ENTRY: create new lead

      // Cascade agent to all existing profile leads if changed
      if (agentChanged) {
        await cascadeAgentToProfileLeads(
          existingProfile.id,
          finalAgentId,
          actorId,
          transaction,
          source,
          `New product re-entry: "${requestedProduct.label}"`,
        );
      }

      const sourceCreatedAt = resolveTime(
        leadData.source_created_at ??
          extra_fields?.timeStamp ??
          extra_fields?.timestamp ??
          extra_fields?.created_time,
        new Date(),
      );

      lead = await Lead.create(
        {
          profile_id: existingProfile.id,
          product_id: requestedProduct.id,
          subsource_id: resolvedSubsourceId,
          status_id: "s_reentry",
          lead_update_date: new Date(),
          agent_id: finalAgentId,
          assigned_at: assignedAtFor(finalAgentId),
          extra_fields,
          additional_data,
          utm_id,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_content,
          source_created_at: sourceCreatedAt,
        },
        { transaction },
      );

      await Activity.create(
        {
          lead_id: lead.id,
          profile_id: existingProfile.id,
          actor_id: actorId || null,
          type: "System",
          title: "Lead Re-entered (New Product)",
          details: `Re-entered via ${source} for new product: "${requestedProduct.label}". Agent ${finalAgentId ? "assigned" : "unassigned"}.`,
          metadata: {
            source,
            re_entry_type: "new_product",
            product_id: requestedProduct.id,
            product_label: requestedProduct.label,
            subsource_id: resolvedSubsourceId,
            subsource_label: subsourceLabel,
            existing_lead_count: existingLeads.length,
            agent_id: finalAgentId,
          },
        },
        { transaction },
      );

      // Always record for new product — it's a new lead row, always meaningful
      await recordHistory({
        lead,
        actorId,
        changeType: "reentry_new_product",
        source,
        transaction,
      });
    }

    await transaction.commit();

    lead.dataValues.Profile = existingProfile;
    return { lead, profile: existingProfile, status: "RE_ENTRY" };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = {
  createOrProcessReentry,
  normalizePhone,
  cascadeAgentToProfileLeads,
};
