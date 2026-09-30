const { Referral } = require('../models');

async function generateReferralCode() {
  let code, exists;

  do {
    code = Math.random().toString(36).substr(2, 8).toUpperCase();
    exists = await Referral.findOne({ where: { referralCode: code } });
  } while (exists);

  return code;
}

module.exports = generateReferralCode;
