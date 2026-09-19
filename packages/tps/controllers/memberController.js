const { Member, Referral } = require('../models');

exports.registerWithReferral = async (req, res) => {
  const { name, email, phone, referralCode, type } = req.body;

  try {
    const referrer = await Referral.findOne({ where: { referralCode } });

    if (!referrer) {
      return res.status(400).json({ error: 'Invalid referral code' });
    }

    const [member, created] = await Member.findOrCreate({
      where: { email },   // or phone, depending on your uniqueness
      defaults: {
        name,
        phone,
        usedReferralId: referrer.id,
        type: type || 'pm_fellowship',
      },
    });


    res.status(201).json({ message: 'Member registered', data: member });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getReferredMembers = async (req, res) => {
  try {
    const { email } = req.body; // you can also use req.params

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Find referral by email and include all referred members
    const referral = await Referral.findOne({
      where: { email },
      include: [
        {
          model: Member,
          as: "referredMembers",
        },
      ],
    });

    if (!referral) {
      return res.status(404).json({ error: "Referral not found for this email" });
    }

    return res.json({
      referral: {
        id: referral.id,
        name: referral.name,
        email: referral.email,
        referralCode: referral.referralCode,
      },
      members: referral.referredMembers,
    });
  } catch (error) {
    console.error("Error fetching referred members:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getAllMembers = async (req, res) => {
  try {
    const members = await Member.findAll({
      include: [
        {
          model: Referral,
          as: "referrer", // from your association
          attributes: ["id", "name", "email", "referralCode"],
        },
      ],
      order: [["createdAt", "DESC"]], // newest first
    });

    res.json({ members });
  } catch (error) {
    console.error("Error fetching members:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};