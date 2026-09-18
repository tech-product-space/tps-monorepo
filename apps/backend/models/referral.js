module.exports = (sequelize, DataTypes) => {
  const Referral = sequelize.define('Referral', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      primaryKey: true,
    },
    name: DataTypes.STRING,
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    referralCode: DataTypes.STRING,
    type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  }, {
    tableName: 'referrals',
  });

  Referral.associate = (models) => {
    Referral.hasMany(models.Member, {
      foreignKey: 'usedReferralId',
      as: 'referredMembers',
    });
  };

  return Referral;
};
