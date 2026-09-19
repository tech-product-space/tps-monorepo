'use strict';
module.exports = (sequelize, DataTypes) => {
    const PortfolioProject = sequelize.define('PortfolioProject', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        projectName: DataTypes.STRING,
        description: DataTypes.TEXT,
        problemStatement: DataTypes.TEXT,
        goals: DataTypes.TEXT,
        skills: DataTypes.STRING,
        tools: DataTypes.STRING,
        tag: DataTypes.STRING,
        mediaUrl: DataTypes.STRING,
        documentUrl: DataTypes.STRING,
        projectLink: DataTypes.STRING,
        submittedAt: DataTypes.DATE,
    });


    PortfolioProject.associate = function (models) {
        PortfolioProject.belongsTo(models.users, {
            foreignKey: 'userId',
            onDelete: 'CASCADE',
        });
    };

    return PortfolioProject;
};
