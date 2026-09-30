module.exports = (sequelize, DataTypes) => {
  const Member = sequelize.define('Member', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      primaryKey: true,
    },
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    phone: DataTypes.STRING, // ✅ Add this line
    usedReferralId: DataTypes.UUID,
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pm_fellowship',
    },
  }, {
    tableName: 'members',
  });

  Member.associate = (models) => {
    Member.belongsTo(models.Referral, {
      foreignKey: 'usedReferralId',
      as: 'referrer',
    });
  };

  return Member;
};
