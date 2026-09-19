const psEnv = require("@ps/env/tps");
const { Op, Sequelize } = require("sequelize");
const { PlatformLead, PhoneVerification } = require("../models");
const { getPaginationParams, getMeta } = require("../utils/pagination");
const { generateLeadToken } = require("../utils/platformLeads/leadToken");
const { verifyLeadToken } = require("../utils/platformLeads/leadToken");
const { generateOtp, hashOtp } = require("../utils/otpUtil");
const Otp = require("../models/mongo/Otp");
const { generateOtpToken } = require("../utils/otpToken");
const sendOtp = require("../service/whatsapp/sendOtp");
const { WHATSAPP_PROVIDER } = require("../constants/whatsapp");

const OTP_REQUIRED_TYPES = new Set([
  "free-course-enrollments",
  "ai-for-pm-enrollments",
  "pm-fellowship-enrollments",
  "interview-course-download-curriculum",
  "ai-for-pm-download-curriculum",
  "pm-fellowship-download-curriculum",
]);

// POST a lead
exports.createLead = async (req, res) => {
  try {
    const { name, email, phone, type, additionalData = {} } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: "Name and Email are required" });
    }

    const requiresOtp = OTP_REQUIRED_TYPES.has(type);
    const countryCode = additionalData?.country_code;
    const isIndianNumber = countryCode === "+91" && phone;

    /**
     * Check if phone is already verified on ANY lead
     */
    let isPhoneAlreadyVerified = false;

    if (phone && requiresOtp) {
      const verifiedPhone = await PhoneVerification.findOne({
        where: {
          phone,
          country_code: countryCode,
        },
        attributes: ["phone"],
        raw: true,
      });

      isPhoneAlreadyVerified = !!verifiedPhone;
    }

    /**
     * create lead
     */
    const lead = await PlatformLead.create({
      name,
      email,
      phone,
      type,
      additionalData,
    });

    /**
     * Skip OTP if:
     * - Not Indian number
     * - OR phone already verified
     */
    if (!requiresOtp || isPhoneAlreadyVerified) {
      return res.status(201).json({
        success: true,
        message: "Lead created successfully",
        otpVerificationRequired: false,
        lead: {
          id: lead.id,
        },
      });
    }

    /**
     *  OTP flow
     */
    const otp = generateOtp(4);
    const hashedOtp = await hashOtp(otp);

    const otpData = await Otp.create({
      countryCode,
      phone,
      otp: hashedOtp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      entity: "platform-lead",
      entityIdentifier: lead.id,
    });

    const otpToken = generateOtpToken({
      otpId: otpData._id,
      data: { leadId: lead.id },
      expiry: "10m",
    });

    res.status(201).json({
      success: true,
      message: "Lead created successfully",
      otpVerificationRequired: psEnv.OTP_MODE === "live",
      otpToken,
      otpExpiresIn: 600,
      lead: {
        id: lead.id,
      },
    });

    /**
     * Send OTP async
     */
    setImmediate(async () => {
      try {
        if (psEnv.OTP_MODE === "live") {
          await sendOtp(`${countryCode}${phone}`, otp, {
            provider: WHATSAPP_PROVIDER.GALLABOX,
            recipientName: name,
          });
        } else {
          console.log("OTP for verifying Lead:", otp);
        }
      } catch (err) {
        console.error("OTP sending failed:", err);
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create lead" });
  }
};

// PATCH /leads/:leadId/phone
exports.updateLeadPhone = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { phone, countryCode } = req.body;

    const lead = await PlatformLead.findByPk(leadId);

    if (!lead) {
      return res.status(404).json({
        error: "Lead not found",
      });
    }

    /**
     * check if phone already verified
     */
    const verifiedPhone = await PhoneVerification.findOne({
      where: {
        phone,
        country_code: countryCode,
      },
      attributes: ["phone"],
      raw: true,
    });

    const isPhoneAlreadyVerified = !!verifiedPhone;

    /**
     * update lead
     */
    lead.phone = phone;
    lead.additionalData = {
      ...lead.additionalData,
      country_code: countryCode,
    };

    await lead.save();

    /**
     * skip OTP if verified
     */
    if (isPhoneAlreadyVerified) {
      return res.json({
        success: true,
        message: "Phone already verified",
        otpVerificationRequired: false,
      });
    }

    /**
     * create OTP
     */
    const otp = generateOtp(4);
    const hashedOtp = await hashOtp(otp);

    const otpData = await Otp.create({
      phone,
      countryCode,
      otp: hashedOtp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      entity: "platform-lead",
      entityIdentifier: lead.id,
    });

    const otpToken = generateOtpToken({
      otpId: otpData._id,
      data: { leadId: lead.id },
      expiry: "10m",
    });

    /**
     * send OTP
     */
    if (psEnv.OTP_MODE === "live") {
      sendOtp(`${countryCode}${phone}`, otp).catch(err => console.error(err));
    } else {
      console.log("OTP:", otp);
    }

    return res.json({
      success: true,
      otpVerificationRequired: psEnv.OTP_MODE === "live",
      otpToken,
      otpExpiresIn: 600,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to update phone",
    });
  }
};

// GET /leads?type=<type>&search=<name>
exports.getAllLeads = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 20, 100);
    const { search, type } = req.query;

    const whereClause = {};

    if (search && search.trim()) {
      const cleanedSearch = search.trim();

      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${cleanedSearch}%` } },
        { email: { [Op.iLike]: `%${cleanedSearch}%` } },
        { phone: { [Op.iLike]: `%${cleanedSearch}%` } }, 
      ];
    }
    
    if (type && type !== "all") {
      if (type.includes(",")) {
        const types = type.split(",").map((t) => t.trim());
        whereClause.type = { [Op.in]: types };
      } else {
        whereClause.type = type;
      }
    }

    const { count, rows } = await PlatformLead.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [["createdAt", "DESC"]],

      include: [
        {
          model: PhoneVerification,
          as: "phoneVerification",
          attributes: ["phone", "country_code", "verified_at"],
          required: false,
          on: {
            phone: Sequelize.where(
              Sequelize.col("PlatformLead.phone"),
              "=",
              Sequelize.col("phoneVerification.phone"),
            ),
            country_code: Sequelize.where(
              Sequelize.literal(
                `"PlatformLead"."additionalData"->>'country_code'`,
              ),
              "=",
              Sequelize.col("phoneVerification.country_code"),
            ),
          },
        },
      ],
    });

    const data = rows.map((lead) => {
      const json = lead.toJSON();

      json.phoneVerification = {
        phone: json.phoneVerification?.phone || json.phone,
        countryCode:
          json.phoneVerification?.country_code ||
          json.additionalData?.country_code,
        verified: !!json.phoneVerification,
        verifiedAt: json.phoneVerification?.verified_at || null,
      };

      return json;
    });
    const meta = getMeta(count, page, limit);

    return res.status(200).json({
      success: true,
      data,
      meta,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
};

//GET /leads/download?type=<type>
exports.downloadPlatformLeads = async (req, res) => {
  try {
    const { startDate, endDate, type = "all" } = req.query;

    const whereClause = {};

    if (type && type !== "all") {
      whereClause.type = type;
    }

    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [
          new Date(startDate).setHours(0, 0, 0, 0),
          new Date(endDate).setHours(23, 59, 59, 999),
        ],
      };
    } else if (startDate) {
      whereClause.createdAt = {
        [Op.gte]: new Date(startDate).setHours(0, 0, 0, 0),
      };
    } else if (endDate) {
      whereClause.createdAt = {
        [Op.lte]: new Date(endDate).setHours(23, 59, 59, 999),
      };
    }

    const leads = await PlatformLead.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: leads,
    });
  } catch (error) {
    console.error("DOWNLOAD ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch platform leads",
    });
  }
};

// GET all leads by type
exports.getLeadsByType = async (req, res) => {
  try {
    const { type } = req.params;

    const leads = await PlatformLead.findAll({
      where: { type },
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json(leads);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch leads by type" });
  }
};

// DELETE a lead by ID
exports.deleteLead = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await PlatformLead.findByPk(id);

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    await lead.destroy();

    res.status(200).json({ message: "Lead deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete lead" });
  }
};

exports.deleteLeadsByIds = async (req, res) => {
  try {
    const { ids } = req.body; // Expecting { "ids": [1, 2, 3] }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ error: "An array of lead IDs is required" });
    }

    const deletedCount = await PlatformLead.destroy({
      where: {
        id: {
          [Op.in]: ids,
        },
      },
    });

    if (deletedCount === 0) {
      return res
        .status(404)
        .json({ error: "No leads found for the given IDs" });
    }

    res.status(200).json({
      message: `Deleted ${deletedCount} lead(s) successfully`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete leads" });
  }
};

// GET all leads by status
exports.getLeadsByStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const leads = await PlatformLead.findAll({
      where: { status },
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json(leads);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch leads by status" });
  }
};

// UPDATE lead status by ID
exports.updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = [
      "Not interested",
      "Positive",
      "Hot Lead",
      "Next Cohort",
      "Paid",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const lead = await PlatformLead.findByPk(id);

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    lead.status = status;
    await lead.save();

    res.status(200).json({ message: "Lead status updated successfully", lead });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update lead status" });
  }
};

// assign / reassign a lead
exports.assignLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    if (!assignedTo) {
      return res.status(400).json({ error: "assignedTo is required" });
    }

    const lead = await PlatformLead.findByPk(id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    lead.assignedTo = assignedTo;
    await lead.save();

    res.status(200).json({ message: "Lead assigned successfully", lead });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to assign lead" });
  }
};

// Get all leads assigned to a person
exports.getLeadsByAssignee = async (req, res) => {
  try {
    const { name } = req.params;

    const leads = await PlatformLead.findAll({
      where: { assignedTo: name },
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json(leads);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch leads by assignee" });
  }
};

// Unassign a lead
exports.unassignLead = async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await PlatformLead.findByPk(id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    lead.assignedTo = null;
    await lead.save();

    res.status(200).json({ message: "Lead unassigned", lead });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to unassign lead" });
  }
};

// To save the leads data step one
exports.createLeadStepOne = async (req, res) => {
  try {
    const { name, email, phone, type, additionalData } = req.body;

    if (!name || !email || !type) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const finalAdditionalData =
      typeof additionalData === "object" && additionalData !== null
        ? {
          ...additionalData,
          stepCompleted: 1,
        }
        : { stepCompleted: 1 };

    lead = await PlatformLead.create({
      name,
      email,
      phone,
      type,
      additionalData: finalAdditionalData,
    });

    const token = generateLeadToken(lead);

    return res.json({
      success: true,
      token,
    });
  } catch (error) {
    console.error("Create lead step 1 error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
// To update the leads data step One
exports.updateLeadStepOne = async (req, res) => {
  try {
    const { token, name, email, phone, lookingFor, country_code } = req.body;

    if (!token) {
      return res.status(401).json({ message: "Token is required" });
    }

    const decoded = verifyLeadToken(token);

    const lead = await PlatformLead.findByPk(decoded.leadId);

    if (!lead) {
      return res
        .status(403)
        .json({ message: "Invalid token - lead not found" });
    }

    if (lead.email !== decoded.email) {
      return res
        .status(403)
        .json({ message: "Invalid token - email mismatch" });
    }

    await lead.update({
      name,
      email,
      phone,
      additionalData: {
        ...lead.additionalData,
        lookingFor,
        stepCompleted: 1,
        country_code,
      },
    });

    let newToken = null;
    if (email !== decoded.email) {
      newToken = generateLeadToken(lead);
    }

    return res.json({
      success: true,
      token: newToken,
    });
  } catch (error) {
    console.error("Update lead step 1 error:", error);
    return res.status(401).json({ message: "Token expired or invalid" });
  }
};

// To save the leads data step Two
exports.updateLeadStepTwo = async (req, res) => {
  try {
    const { token, ...stepTwoData } = req.body;

    if (!token) {
      return res.status(401).json({ message: "Token is required" });
    }

    const decoded = verifyLeadToken(token);

    const lead = await PlatformLead.findByPk(decoded.leadId);

    if (!lead || lead.email !== decoded.email) {
      return res.status(403).json({ message: "Invalid token" });
    }

    await lead.update({
      additionalData: {
        ...lead.additionalData,
        ...stepTwoData,
        stepCompleted: 2,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Update lead step 2 error:", error);

    return res.status(401).json({
      message: "Token expired or invalid",
    });
  }
};
