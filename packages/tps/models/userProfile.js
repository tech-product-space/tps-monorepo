module.exports = (sequelize, DataTypes) => {
    const UserProfile = sequelize.define('UserProfile', {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true
        },
        mobile: {
            type: DataTypes.STRING,
            allowNull: true
        },
        query: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        company: {
            type: DataTypes.STRING,
            allowNull: true
        },
        current_role: {
            type: DataTypes.STRING,
            allowNull: true
        },
        linkedin: {
            type: DataTypes.STRING,
            allowNull: true
        },
        target_domain: {
            type: DataTypes.STRING,
            allowNull: true
        },
        question_type: {
            type: DataTypes.STRING,
            allowNull: true
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        time: {
            type: DataTypes.STRING,
            allowNull: true
        },
        referral_code: {
            type: DataTypes.STRING,
            allowNull: true
        },
        best_describe_you: {
            type: DataTypes.STRING,
            allowNull: true
        },
        best_describe_your_role: {
            type: DataTypes.STRING,
            allowNull: true
        },
        designation: {
            type: DataTypes.STRING,
            allowNull: true
        },
        gender: {
            type: DataTypes.STRING,
            allowNull: true
        },
        resume: {
            type: DataTypes.STRING,
            allowNull: true
        },
    }, {
        tableName: 'user_profiles',
        underscored: true
    });

    UserProfile.associate = models => {
        UserProfile.belongsTo(models.users, {
            foreignKey: 'userId',
            as: 'user',
            onDelete: 'CASCADE'
        });
    };

    return UserProfile;
};
