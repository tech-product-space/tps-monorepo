const { UserProfile, users } = require('../models');

const upsertUserProfile = async (req, res) => {
    const { user_id, type, ...updates } = req.body;

    if (!user_id) {
        return res.status(400).json({ success: false, message: "user_id is required" });
    }

    try {
        // Step 1: Check if user exists
        const userExists = await users.findByPk(user_id);
        if (!userExists) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Step 2: Check if required fields exist in case of insert
        const existingProfile = await UserProfile.findOne({ where: { user_id, type } });

        if (existingProfile) {
            // Just update the provided fields
            await existingProfile.update(updates);
            return res.status(200).json({ success: true, data: existingProfile });
        } else {
            // Check if required fields (like email) are present for creating
            if (!updates.email) {
                return res.status(400).json({ success: false, message: "email is required to create profile" });
            }

            const newProfile = await UserProfile.create({
                userId: user_id,
                type,
                ...updates,
            });

            return res.status(200).json({ success: true, data: newProfile });
        }
    } catch (err) {
        console.error("Upsert error:", err);
        res.status(500).json({ success: false, message: "Something went wrong", error: err.message });
    }
};

const getUserProfile = async (req, res) => {
    try {
        const { user_id, type } = req.body;

        const profile = await UserProfile.findOne({ where: { userId: user_id, type: type } });

        if (!profile) return res.status(404).json({ message: 'Profile not found' });

        // Remove null fields
        const filteredProfile = Object.fromEntries(
            Object.entries(profile.dataValues).filter(([_, value]) => value !== null)
        );

        res.status(200).json(filteredProfile);
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const getCurrentUser = async (req, res) => {
  try {
    const { user_id } = req.params;

    const profile = await users.findByPk(user_id, {
      attributes: ["id", "name", "email", "phone", "profile_picture", "createdAt"]
    });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    return res.status(200).json(profile);

  } catch (error) {
    console.error("Fetch error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};


const getUserAccount = async (req, res) => {
    try {
        const { user_id, type } = req.body;
        const profile = await UserProfile.findOne({
            where: { userId: user_id, type: type },
            attributes: [
                'name',
                'email',
                'mobile',
                'company',
                'linkedin',
                'designation',
                'best_describe_you',
                'best_describe_your_role',
                'gender'
            ]
        });

        if (!profile) return res.status(404).json({ message: 'Profile not found' });
        res.status(200).json(profile);
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const getProfilePicture = async (req, res) => {
    try {
        const { user_id } = req.body;

        if (!user_id) return res.status(400).json({ message: "user_id is required" });

        const user = await users.findByPk(user_id, {
            attributes: ["profile_picture"],
        });

        if (!user) return res.status(404).json({ message: "User not found" });

        res.status(200).json({ profile_picture: user.profile_picture });
    } catch (error) {
        console.error("Fetch error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

const updateProfilePicture = async (req, res) => {
    try {
        const { user_id, profile_picture } = req.body;

        if (!user_id || !profile_picture) {
            return res.status(400).json({ message: "user_id and profile_picture are required" });
        }

        const [updated] = await users.update(
            { profile_picture },
            { where: { id: user_id } }
        );

        if (!updated) return res.status(404).json({ message: "User not found" });

        res.status(200).json({ message: "Profile picture updated successfully" });
    } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

const getUsersByType = async (req, res) => {
    const { type } = req.query;

    if (!type) {
        return res.status(400).json({ success: false, message: "type is required" });
    }

    try {
        const profiles = await UserProfile.findAll({
            where: { type },
            order: [['createdAt', 'DESC']]
        });

        res.status(200).json({ success: true, data: profiles });
    } catch (error) {
        console.error("Error fetching users by type:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

const getAllTypes = async (req, res) => {
    try {
        const types = await UserProfile.findAll({
            attributes: [
                [UserProfile.sequelize.fn('DISTINCT', UserProfile.sequelize.col('type')), 'type']
            ],
            raw: true
        });

        const uniqueTypes = types.map(t => t.type);

        res.status(200).json({ success: true, data: uniqueTypes });
    } catch (error) {
        console.error("Error fetching unique types:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

module.exports = {
    upsertUserProfile,
    getUserProfile,
    getCurrentUser,
    getUsersByType,
    getAllTypes,
    getUserAccount,
    getProfilePicture,
    updateProfilePicture
};