const { users, user_fitment_scores } = require('../models');

exports.createOrUpdateFitment = async (req, res) => {
    try {
        const { userId, ...fitmentData } = req.body;

        const user = await users.findByPk(userId);
        if (!user) {
            return res.status(400).json({ message: 'Invalid userId' });
        }

        // Check if a fitment row already exists for this user
        const existingFitment = await user_fitment_scores.findOne({ where: { userId } });

        if (existingFitment) {
            // Update existing record
            await existingFitment.update(fitmentData);
            return res.status(200).json({ result: 'SUCCESS', message: 'Fitment details updated', data: existingFitment });
        } else {
            // Create new record
            const newFitment = await user_fitment_scores.create({ userId, ...fitmentData });
            return res.status(201).json({ result: 'SUCCESS', message: 'Fitment details created', data: newFitment });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ result: 'ERROR', message: 'Error saving fitment details', error });
    }
};

exports.getFitmentByUserId = async (req, res) => {
    try {
        const { userId } = req.params;

        const fitment = await user_fitment_scores.findOne({
            where: { userId },
            include: [{ model: users, attributes: ['id', 'name', 'email'] }],
        });

        if (!fitment) {
            return res.status(404).json({ result: 'WARNING', message: 'Fitment details not found for this user' });
        }

        res.status(200).json({ result: 'SUCCESS', data: fitment });
    } catch (error) {
        console.error(error);
        res.status(500).json({ result: 'ERROR', message: 'Error retrieving fitment details', error });
    }
};

