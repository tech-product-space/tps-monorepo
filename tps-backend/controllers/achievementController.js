const { Achievement } = require('../models');

exports.create = async (req, res) => {
    try {
        const data = req.body;
        const [achievement, created] = await Achievement.upsert(data, {
            returning: true,
        });
        res.status(created ? 201 : 200).json(achievement);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
};

exports.getAll = async (req, res) => {
    try {
        const userId = req.params.userId;
        const achievements = await Achievement.findAll({ where: { userId } });
        res.status(200).json(achievements);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch achievements' });
    }
};

exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const [updated] = await Achievement.update(req.body, {
            where: { id },
        });

        if (updated) {
            const updatedAchievement = await Achievement.findByPk(id);
            res.status(200).json(updatedAchievement);
        } else {
            res.status(404).json({ error: 'Achievement not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Update failed' });
    }
};

exports.remove = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Achievement.destroy({ where: { id } });

        if (deleted) {
            res.status(200).json({ message: 'Achievement deleted successfully' });
        } else {
            res.status(404).json({ error: 'Achievement not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Delete failed' });
    }
};

