const { Education, users } = require('../models');

exports.create = async (req, res) => {
  try {
    const data = req.body;
    const records = Array.isArray(data) ? data : [data];

    if (!records.length) {
      return res.status(400).json({ error: 'No records provided.' });
    }

    // Ensure user exists
    const userExists = await users.findByPk(records[0].userId);
    if (!userExists) {
      return res.status(400).json({ error: `User with id ${records[0].userId} does not exist.` });
    }

    // Fields to update if duplicate id is found
    const updateFields = [
      'institution',
      'degree',
      'startMonth',
      'startYear',
      'endMonth',
      'endYear',
      'userId',
      'updatedAt'
    ];

    // Use bulkCreate with updateOnDuplicate
    const result = await Education.bulkCreate(records.map(r => {
      // Ensure updatedAt is fresh
      return {
        ...r,
        updatedAt: new Date()
      };
    }), {
      updateOnDuplicate: updateFields
    });

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
};

exports.getByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const educationRecords = await Education.findAll({ where: { userId } });
    res.status(200).json(educationRecords);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch education' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await Education.update(req.body, { where: { id } });

    if (updated) {
      const updatedRecord = await Education.findByPk(id);
      res.status(200).json(updatedRecord);
    } else {
      res.status(404).json({ error: 'Education record not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update education record' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Education.destroy({ where: { id } });

    if (deleted) {
      res.status(200).json({ message: 'Education record deleted successfully' });
    } else {
      res.status(404).json({ error: 'Education record not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete education record' });
  }
};
