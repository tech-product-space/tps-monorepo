'use strict';

module.exports = (sequelize, DataTypes) => {
    const PersonalInfo = sequelize.define(
        'PersonalInfo',
        {
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
                onDelete: 'CASCADE',
            },
            name: DataTypes.STRING,
            email: DataTypes.STRING,
            mobile: DataTypes.STRING,
            company: DataTypes.STRING,
            gender: DataTypes.STRING,
            linkedin: DataTypes.STRING,
            resumeUrl: DataTypes.STRING,
            best_describe_you: DataTypes.STRING,
            best_describe_your_role: DataTypes.STRING,
            designation: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            isPublished: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
        },
        {
            timestamps: true,
        }
    );

    PersonalInfo.associate = function (models) {
        PersonalInfo.belongsTo(models.users, { foreignKey: 'userId' });
    };

    return PersonalInfo;
};
