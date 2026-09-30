const { ResourceLead, Resource } = require("../../../models");

module.exports = async function resourceLeadsFetcher(limit) {
  return ResourceLead.findAll({
    where: {
      leads91Synced: false,
    },
    include: [
      {
        model: Resource,
        as: "resource",
        attributes: ["id", "title", "resourceSlug"],
      },
    ],
    limit,
    order: [["createdAt", "ASC"]],
  });
};
