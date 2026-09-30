const { Sequelize } = require('sequelize');
const {
    users,
    WorkExperience,
    PortfolioProject,
    PersonalInfo,
    Education,
    Achievement,
} = require('../models');

exports.getAllActiveUsers = async (req, res) => {
    try {
        const activeUsers = await users.findAll({
            attributes: ['id', 'name', 'profile_picture', 'email', 'phone'],
            include: [
                { model: WorkExperience, as: 'WorkExperiences', required: false, attributes: ['id'] },
                { model: PortfolioProject, as: 'PortfolioProjects', required: false, attributes: ['id'] },
                { model: PersonalInfo, as: 'PersonalInfo', required: false, attributes: ['id'] },
                { model: Education, as: 'Educations', required: false, attributes: ['id'] },
                { model: Achievement, as: 'Achievements', required: false, attributes: ['id'] },
            ],
            where: {
                [Sequelize.Op.or]: [
                    { '$WorkExperiences.id$': { [Sequelize.Op.ne]: null } },
                    { '$PortfolioProjects.id$': { [Sequelize.Op.ne]: null } },
                    { '$PersonalInfo.id$': { [Sequelize.Op.ne]: null } },
                    { '$Educations.id$': { [Sequelize.Op.ne]: null } },
                    { '$Achievements.id$': { [Sequelize.Op.ne]: null } },
                ],
            },
            distinct: true,
            order: [
                ['updatedAt', 'DESC'], // sort by latest updated first
                ['createdAt', 'DESC']  // if updatedAt is null, fallback 
            ]
        });


        res.json(activeUsers);
    } catch (error) {
        console.error('Error fetching active users:', error);
        res.status(500).json({ error: 'Failed to fetch active users' });
    }
};

exports.getUserPortfolio = async (req, res) => {
    try {
        const activeUsers = await users.findAll({
            attributes: ['id', 'name', 'profile_picture', 'email'],
            include: [
                { model: WorkExperience, as: 'WorkExperiences', required: false, attributes: ['id'] },
                { model: PortfolioProject, as: 'PortfolioProjects', required: false, attributes: ['id'] },
                { model: PersonalInfo, as: 'PersonalInfo', required: false, attributes: ['id', 'isPublished'] },
                { model: Education, as: 'Educations', required: false, attributes: ['id'] },
                { model: Achievement, as: 'Achievements', required: false, attributes: ['id'] },
            ],
            where: {
                [Sequelize.Op.or]: [
                    { '$WorkExperiences.id$': { [Sequelize.Op.ne]: null } },
                    { '$PortfolioProjects.id$': { [Sequelize.Op.ne]: null } },
                    { '$PersonalInfo.id$': { [Sequelize.Op.ne]: null } },
                    { '$Educations.id$': { [Sequelize.Op.ne]: null } },
                    { '$Achievements.id$': { [Sequelize.Op.ne]: null } },
                ],
            },
            distinct: true,
            order: [
                ['updatedAt', 'DESC'], // latest first
                ['createdAt', 'DESC'], // fallback
            ],
        });

        // ✅ Format the user data as requested
        const formattedUsers = activeUsers.map((user) => ({
            userId: user.id,
            profile_picture: user.profile_picture,
            name: user.name,
            email: user.email,
            WorkExperience: user.WorkExperiences?.length > 0,
            PortfolioProject: user.PortfolioProjects?.length > 0,
            PersonalInfo: !!user.PersonalInfo,
            Education: user.Educations?.length > 0,
            Achievement: user.Achievements?.length > 0,
            isPublished: user.PersonalInfo?.isPublished || false,
        }));

        // ✅ Return simplified JSON (no pagination)
        res.json({
            data: formattedUsers,
            total: formattedUsers.length,
        });
    } catch (error) {
        console.error('Error fetching active users:', error);
        res.status(500).json({ error: 'Failed to fetch active users' });
    }
};

exports.getPublishedUserPortfolio = async (req, res) => {
    try {
        const publishedUsers = await users.findAll({
            attributes: ["id", "name", "profile_picture"],
            include: [
                {
                    model: PersonalInfo,
                    as: "PersonalInfo",
                    required: true, 
                    attributes: ["best_describe_you"],
                    where: { isPublished: true },
                },
            ],
            order: [
                ["updatedAt", "DESC"],
                ["createdAt", "DESC"],
            ],
        });

        // ✅ Return only the needed fields
        const formattedUsers = publishedUsers.map((user) => ({
            userId: user.id,
            profile_picture: user.profile_picture,
            name: user.name,
            best_describe_you: user.PersonalInfo?.best_describe_you || null,
        }));

        res.json({
            data: formattedUsers,
            total: formattedUsers.length,
        });
    } catch (error) {
        console.error("Error fetching published portfolios:", error);
        res.status(500).json({ error: "Failed to fetch published portfolios" });
    }
};

exports.toggleIsPublished = async (req, res) => {
    try {
        const { userId } = req.params;

        const personalInfo = await PersonalInfo.findOne({ where: { userId } });

        if (!personalInfo) {
            return res.status(404).json({ error: "Personal info not found for this user" });
        }

        const newStatus = !personalInfo.isPublished;
        personalInfo.isPublished = newStatus;
        await personalInfo.save();

        res.json({
            message: `isPublished updated successfully`,
            data: {
                userId,
                isPublished: newStatus,
            },
        });
    } catch (error) {
        console.error("Error toggling isPublished:", error);
        res.status(500).json({ error: "Failed to toggle isPublished" });
    }
};