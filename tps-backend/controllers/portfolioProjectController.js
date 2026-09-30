const { users, PersonalInfo, PortfolioProject } = require('../models');

exports.create = async (req, res) => {
  try {
    const [project, created] = await PortfolioProject.upsert(req.body, {
      returning: true,
    });

    res.status(created ? 201 : 200).json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create or update portfolio project' });
  }
};

exports.getAllByUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const projects = await PortfolioProject.findAll({ where: { userId } });
    res.status(200).json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch portfolio projects' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await PortfolioProject.update(req.body, {
      where: { id },
    });

    if (updated) {
      const updatedProject = await PortfolioProject.findByPk(id);
      res.status(200).json(updatedProject);
    } else {
      res.status(404).json({ error: 'Portfolio project not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update portfolio project' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await PortfolioProject.destroy({ where: { id } });

    if (deleted) {
      res.status(200).json({ message: 'Portfolio project deleted successfully' });
    } else {
      res.status(404).json({ error: 'Portfolio project not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete portfolio project' });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await PortfolioProject.findByPk(id, {
      include: [
        {
          model: users,
          attributes: ['name', 'profile_picture'],
          include: [
            {
              model: PersonalInfo,
              as: 'PersonalInfo',
              attributes: ['linkedin'],
            },
          ],
        },
      ],
    });

    if (!project) {
      return res.status(404).json({ error: 'Portfolio project not found' });
    }

    // Flatten the response
    const formatted = {
      ...project.toJSON(),
      name: project.user?.name,
      profile_picture: project.user?.profile_picture,
      linkedin: project.user?.PersonalInfo?.linkedin,
    };

    // Optionally remove nested user if you don’t need it
    delete formatted.user;

    res.status(200).json({
      result: 'SUCCESS',
      data: formatted,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch portfolio project' });
  }
};

exports.getAllProjectsByUserPresence = async (req, res) => {
  try {
    const { isWithUserId } = req.body;

    let whereClause = {};

    if (isWithUserId === true) {
      whereClause.userId = { [require('sequelize').Op.ne]: null };
    } else if (isWithUserId === false) {
      whereClause.userId = null;
    }

    const projects = await PortfolioProject.findAll({ where: whereClause });

    res.status(200).json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch portfolio projects' });
  }
};
