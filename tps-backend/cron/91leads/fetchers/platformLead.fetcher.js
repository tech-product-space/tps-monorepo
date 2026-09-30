const { PlatformLead } = require("../../../models");

module.exports = async function fetchPlatformLeads(limit) {
  return PlatformLead.findAll({
    where: { leads91Synced: false },
    limit,
    order: [["createdAt", "ASC"]],
  });
};
