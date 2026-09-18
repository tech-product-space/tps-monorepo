const { ReferralCode, Referral, Member, users } = require('../models');
const { Sequelize } = require('sequelize');
const { generateReferralCode } = require('../utils/eventReferralId/eventReferralId');

exports.createReferralCode = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Check if referral already exists
    let userReferral = await ReferralCode.findOne({
      where: { userId },
    });

    if (userReferral) {
      return res.status(200).json({ code: userReferral.code });
    }

    // Generate UNIQUE referral code
    let code;
    let exists;

    do {
      code = generateReferralCode(8);
      exists = await ReferralCode.findOne({ where: { code } });
    } while (exists);

    // Create referral record
    userReferral = await ReferralCode.create({
      userId,
      code,
    });

    return res.status(201).json({ code: userReferral.code });

  } catch (error) {
    console.error('Error creating referral code:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.addReferralForUser = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Get user details
    const user = await users.findByPk(userId, {
      attributes: ["id", "name", "email", "phone"],
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find or create referral
    const [referral, created] = await Referral.findOrCreate({
      where: { email: user.email },
      defaults: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        referralCode: generateReferralCode(),
        type: null,
      },
    });

    res.status(201).json({
      success: true,
      message: created ? "Referral created" : "Referral already exists",
      data: referral,
    });
  } catch (error) {
    console.error("Error creating referral:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.addCohortMember = async (req, res) => {
  const { name, email, phone, type } = req.body;

  try {
    const referralCode = generateReferralCode();

    const referral = await Referral.create({ name, email, phone, referralCode, type });

    res.status(201).json({ success: true, message: 'Referral created', data: referral });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteReferral = async (req, res) => {
  const { id } = req.params;

  try {
    const referral = await Referral.findByPk(id);

    if (!referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }

    await referral.destroy();

    res.status(200).json({ success: true, message: 'Referral deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateReferral = async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, type } = req.body;

  try {
    const referral = await Referral.findByPk(id);

    if (!referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }

    await referral.update({ name, email, phone, type });

    res.status(200).json({ success: true, message: 'Referral updated successfully', data: referral });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllReferrals = async (req, res) => {
  try {
    const referrals = await Referral.findAll({
      attributes: [
        'id',
        'name',
        'email',
        'phone',
        'type',
        'referralCode',
        [
          Sequelize.literal(`(
            SELECT COUNT(*) FROM "members" AS "Member"
            WHERE "Member"."usedReferralId" = "Referral"."id"
          )`),
          'memberCount'
        ]
      ],
      order: [['createdAt', 'DESC']],
    });

    res.status(200).json(referrals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getReferralCreatorByCode = async (req, res) => {
  const { referralCode } = req.params;

  try {
    const referral = await Referral.findOne({
      where: { referralCode },
      attributes: ['id', 'name', 'type'],
    });

    if (!referral) {
      return res.status(404).json({ error: 'Referral code not found' });
    }

    res.status(200).json({
      id: referral.id,
      name: referral.name,
      type: referral.type,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMembersByReferralId = async (req, res) => {
  const { id } = req.params;

  try {
    const referral = await Referral.findByPk(id, {
      include: [
        {
          model: Member,
          as: 'referredMembers',
          attributes: ['id', 'name', 'email', 'phone'],
        },
      ],
    });

    if (!referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }

    res.status(200).json({
      referralId: referral.id,
      referralCode: referral.referralCode,
      referredMembers: referral.referredMembers,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};