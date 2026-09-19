const { ReferralCode, EventRegistration, users } = require('../models');

exports.getReferralSummary = async (req, res) => {
  try {
    const referrals = await ReferralCode.findAll({
      attributes: ['code', 'userId'],
      include: [
        {
          model: users,
          as: 'referrer',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: EventRegistration,
          as: 'registrations',
          attributes: []
        }
      ],
      group: ['ReferralCode.id', 'referrer.id'],
      // Count registrations per referral code
      // Sequelize.fn with literal can be used but simplified here:
      subQuery: false,
      raw: false,
    });

    // Add referralCount manually (Sequelize has limitations with grouping + counting on hasMany)
    const result = await Promise.all(referrals.map(async (ref) => {
      const count = await EventRegistration.count({ where: { referredByCode: ref.code } });
      return {
        referralCode: ref.code,
        userId: ref.userId,
        name: ref.referrer.name,
        email: ref.referrer.email,
        referralCount: count
      };
    }));

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getReferredUsers = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find referral code by userId
    const referral = await ReferralCode.findOne({ where: { userId } });
    if (!referral) {
      return res.status(404).json({ error: 'Referral code not found for this user' });
    }

    // Find all event registrations referred by this referral code
    const referredRegistrations = await EventRegistration.findAll({
      where: { referredByCode: referral.code },
      include: [{
        model: users,
        as: 'user',
        attributes: ['id', 'name', 'email'],
      }]
    });

    res.json(referredRegistrations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};
