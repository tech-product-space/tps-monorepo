const { UserAppToken } = require("../models");

exports.createOrUpdateToken = async (req, res) => {
    try {
        const { user_id, apps, access_token, refresh_token, generated_at } = req.body;

        if (!user_id || !apps || !access_token) {
            return res.status(400).json({ error: "user_id, apps and access_token are required" });
        }

        const [token, created] = await UserAppToken.upsert(
            {
                user_id,
                apps,
                access_token,
                refresh_token,
                generated_at,
            },
            { returning: true }
        );

        return res.status(200).json({
            message: created ? "Token created successfully" : "Token updated successfully",
            data: token,
        });
    } catch (error) {
        console.error("Error saving token:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.getTokenByUserAndApp = async (req, res) => {
    try {
        const { user_id, apps } = req.params;

        const token = await UserAppToken.findOne({
            where: { user_id, apps },
        });

        if (!token) {
            return res.status(404).json({ error: "Token not found" });
        }

        return res.status(200).json(token);
    } catch (error) {
        console.error("Error fetching token:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
