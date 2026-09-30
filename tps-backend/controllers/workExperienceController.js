const { WorkExperience } = require('../models');

exports.create = async (req, res) => {
  try {
    const data = req.body;

    if (Array.isArray(data)) {
      // Bulk insert or update
      const result = await WorkExperience.bulkCreate(data, {
        updateOnDuplicate: [
          'company',
          'role',
          'employmentType',
          'description',
          'startMonth',
          'startYear',
          'endMonth',
          'endYear',
          'currentlyWorking',
          'userId',
          'updatedAt'
        ]
      });
      return res.status(201).json(result);
    }

    // Single insert or update
    const result = await WorkExperience.upsert(data);
    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};


// Get experiences for a user
exports.getByUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const experiences = await WorkExperience.findAll({ where: { userId } });
    res.json(experiences);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch experiences' });
  }
};

// Update a single experience
exports.update = async (req, res) => {
  try {
    const id = req.params.id;
    const [updated] = await WorkExperience.update(req.body, {
      where: { id },
    });

    if (!updated) return res.status(404).json({ message: 'Not found' });

    const updatedRecord = await WorkExperience.findByPk(id);
    res.json(updatedRecord);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update experience' });
  }
};

// Delete experience
exports.remove = async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await WorkExperience.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete experience' });
  }
};
