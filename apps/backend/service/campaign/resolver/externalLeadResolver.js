const { Op, Sequelize } = require("sequelize");
const { ExternalLead } = require("../../../models");
const { EXTERNAL_LEAD_SOURCE } = require("../../../constants/externalLeads");

async function resolveExternalLeads(leadFilters) {
  if (!leadFilters?.sources?.length) return [];

  const leads = [];

  for (const sourceFilter of leadFilters.sources) {
    const { source, types, form_ids, filters = {} } = sourceFilter;

    const where = {
      source,
    };

    if (Array.isArray(form_ids) && form_ids.length) {
      where.external_form_id = {
        [Op.in]: form_ids,
      };
    }

    if (Array.isArray(types) && types.length) {
      where.type_id = {
        [Op.in]: types,
      };
    }

    const andConditions = [];

    if (source === EXTERNAL_LEAD_SOURCE.META) {
      if (Array.isArray(filters.campaigns) && filters.campaigns?.length) {
        andConditions.push(
          Sequelize.where(Sequelize.json("additional_data.campaign_name"), {
            [Op.in]: filters.campaigns,
          }),
        );
      }

      if (Array.isArray(filters.adsets) && filters.adsets?.length) {
        andConditions.push(
          Sequelize.where(Sequelize.json("additional_data.adset_name"), {
            [Op.in]: filters.adsets,
          }),
        );
      }

      if (Array.isArray(filters.ads) && filters.ads?.length) {
        andConditions.push(
          Sequelize.where(Sequelize.json("additional_data.ad_name"), {
            [Op.in]: filters.ads,
          }),
        );
      }
    }

    if (andConditions.length > 0) {
      where[Op.and] = andConditions;
    }

    const externalLeads = await ExternalLead.findAll({
      where,
      attributes: ["id", "name", "email", "phone"],
      raw: true,
    });

    leads.push(
      ...externalLeads.map((lead) => ({
        email: lead.email,
        name: lead.name,
        phone: lead.phone,
        source_type: "external_leads",
        source_id: lead.id,
      })),
    );
  }

  return leads;
}

module.exports = {
  resolveExternalLeads,
};
