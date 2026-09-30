const { Op } = require("sequelize");
const { PlatformLead } = require("../../../models");

async function resolvePlatformLeads(filters) {
  if (!filters?.programs?.length) return [];

  // collect all selected types
  let selectedTypes = [];

  for (const program of filters.programs) {
    if (!program.types || program.types.length === 0) continue;

    selectedTypes.push(...program.types);
  }

  // remove duplicates
  selectedTypes = [...new Set(selectedTypes)];

  if (selectedTypes.length === 0) return [];

  const leads = await PlatformLead.findAll({
    where: {
      type: {
        [Op.in]: selectedTypes,
      },
    },
    attributes: ["id", "name", "email", "phone", "type"],
    raw: true,
  });

  return leads.map((lead) => ({
    email: lead.email,
    name: lead.name,
    phone: lead.phone,
    source_type: "platform_leads",
    source_id: lead.id,
  }));
}

module.exports = {
  resolvePlatformLeads,
};
