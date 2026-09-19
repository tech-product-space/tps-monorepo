const { PersonalInfo, users } = require('../models');

// POST /personal-info
exports.upsertPersonalInfo = async (req, res) => {
    try {
        const { userId, ...fields } = req.body;

        if (!userId) return res.status(400).json({ message: 'userId is required' });

        const existing = await PersonalInfo.findOne({ where: { userId } });

        let info;
        if (existing) {
            await existing.update(fields);
            info = existing;
        } else {
            info = await PersonalInfo.create({ userId, ...fields });
        }

        return res.status(200).json({ message: existing ? 'Updated' : 'Created', data: info });
    } catch (error) {
        console.error('Error in upsertPersonalInfo:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};


// GET /personal-info/:userId
exports.getPersonalInfoByUserId = async (req, res) => {
    try {
        const { userId } = req.params;

        let personalInfo = await PersonalInfo.findOne({ where: { userId } });

        // If no personal info found or name/email missing, fetch from users table
        const user = await users.findByPk(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Create a merged response
        const mergedInfo = {
            userId: user.id,
            name: personalInfo?.name || user.name,
            email: personalInfo?.email || user.email,
            mobile: personalInfo?.mobile || null,
            company: personalInfo?.company || null,
            gender: personalInfo?.gender || null,
            linkedin: personalInfo?.linkedin || null,
            resumeUrl: personalInfo?.resumeUrl || null,
            best_describe_you: personalInfo?.best_describe_you || null,
            best_describe_your_role: personalInfo?.best_describe_your_role || null,
            designation: personalInfo?.designation || null,
            createdAt: personalInfo?.createdAt || null,
            updatedAt: personalInfo?.updatedAt || null,
        };

        return res.status(200).json(mergedInfo);
    } catch (error) {
        console.error('Error in getPersonalInfoByUserId:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};
