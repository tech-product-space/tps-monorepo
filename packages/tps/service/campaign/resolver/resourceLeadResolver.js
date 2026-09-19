const { Op } = require("sequelize");
const { ResourceLead } = require("../../../models");

async function resolveResourceLeads(filters) {
  if (!filters?.resourceFilters) return [];

  const resourceFilters = filters.resourceFilters;

  let leads = [];

  for (const resourceId of Object.keys(resourceFilters)) {

    const filter = resourceFilters[resourceId];
    const roles = filter?.targetRoles || [];

    const where = {
      resourceId: Number(resourceId),
    };

    if (roles.length) {
      where.jobTitle = {
        [Op.in]: roles,
      };
    }

    const resourceLeads = await ResourceLead.findAll({
      where,
      attributes: ["id", "name", "email", "phone", "jobTitle", "resourceId"],
      raw: true,
    });

    const mapped = resourceLeads.map((lead) => ({
      email: lead.email,
      name: lead.name,
      phone: lead.phone,
      source_type: "resources",
      source_id: lead.id,
    }));

    leads.push(...mapped);
  }

  return leads;
}

module.exports = {
  resolveResourceLeads,
};