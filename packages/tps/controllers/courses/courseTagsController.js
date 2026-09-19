const { CourseTag } = require("../../models");
const { Op } = require("sequelize");
const { toSlug } = require("../../utils/slugHelpers");

module.exports = {
  // GET /course-tags
  async getAll(req, res) {
    const tags = await CourseTag.findAll({
      attributes: ["id", "name", "slug"],
      order: [["name", "ASC"]],
    });

    return res.json(tags);
  },

  // POST /course-tags
  async create(req, res) {
    const name = req.body?.name?.trim();

    if (!name) {
      return res.status(400).json({ message: "'name' is required" });
    }

    const slug = toSlug(name);

    const existing = await CourseTag.findOne({
      where: { [Op.or]: [{ name }, { slug }] },
    });
    if (existing) {
      return res.status(400).json({ message: "Tag already exists" });
    }

    const tag = await CourseTag.create({ name, slug });

    return res.status(201).json(tag);
  },

  // PUT /course-tags/:id
  async update(req, res) {
    const { id } = req.params;
    const name = req.body?.name?.trim();

    if (!name) {
      return res.status(400).json({ message: "'name' is required" });
    }

    const tag = await CourseTag.findByPk(id);
    if (!tag) {
      return res.status(404).json({ message: "Tag not found" });
    }

    const slug = toSlug(name);

    const clash = await CourseTag.findOne({
      where: {
        id: { [Op.ne]: id },
        [Op.or]: [{ name }, { slug }],
      },
    });
    if (clash) {
      return res.status(400).json({ message: "Tag already exists" });
    }

    await tag.update({ name, slug });

    return res.json(tag);
  },

  // DELETE /course-tags/:id
  async delete(req, res) {
    const { id } = req.params;

    const tag = await CourseTag.findByPk(id);
    if (!tag) {
      return res.status(404).json({ message: "Tag not found" });
    }

    await tag.destroy();

    return res.json({ message: "Tag deleted successfully" });
  },
};
