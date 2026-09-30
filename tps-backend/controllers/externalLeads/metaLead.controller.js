const {
  ExternalLead,
  ExternalLeadType,
  MetaLeadFormMapping,
  MetaLeadForm,
  MetaPage,
} = require("../../models");
const { sequelize } = require("../../models");
const { Op } = require("sequelize");

const { EXTERNAL_LEAD_SOURCE } = require("../../constants/externalLeads");
const { getMeta, getPaginationParams } = require("../../utils/pagination");
const {
  runMetaFormSync,
  runningSyncs,
} = require("../../service/meta/metaLeadSync");

exports.syncMetaFormLeads = async (req, res) => {
  const { formId } = req.params;

  if (runningSyncs.has(formId)) {
    return res
      .status(409)
      .json({ message: "Sync already in progress for this form" });
  }

  try {
    const form = await MetaLeadForm.findByPk(formId, {
      include: [
        { model: MetaLeadFormMapping, as: "leadTypeMappings" },
        {
          model: MetaPage,
          as: "page",
          attributes: ["page_access_token"],
        },
      ],
    });

    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    runningSyncs.add(formId);

    res.status(202).json({ message: "Sync started" });

    runMetaFormSync(form)
      .then((inserted) => {
        console.log(
          `[meta-sync] form ${form.form_id} done — inserted ${inserted}`,
        );
      })
      .catch((error) => {
        console.error(
          `[meta-sync] form ${form.form_id} failed:`,
          error.response?.data || error,
        );
      })
      .finally(() => {
        runningSyncs.delete(formId);
      });
  } catch (error) {
    runningSyncs.delete(formId);
    console.error(error.response?.data || error);

    return res.status(500).json({ message: "Failed to start sync" });
  }
};

/**
 * All Meta lead forms across every page, with their page name and mapped
 * lead types. Used by pickers (e.g. the workflow live-trigger source
 * selector) that need the full catalog rather than the per-page listing.
 */
exports.getAllMetaForms = async (req, res) => {
  try {
    const forms = await MetaLeadForm.findAll({
      attributes: ["id", "form_id", "form_name", "status", "createdAt"],
      include: [
        {
          model: MetaPage,
          as: "page",
          attributes: ["id", "page_name"],
        },
        {
          model: MetaLeadFormMapping,
          as: "leadTypeMappings",
          attributes: ["id"],
          include: [
            {
              model: ExternalLeadType,
              as: "leadType",
              attributes: ["id", "name"],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const formatted = forms.map((form) => {
      const data = form.toJSON();

      return {
        id: data.id,
        form_id: data.form_id,
        form_name: data.form_name,
        status: data.status,
        page_name: data.page?.page_name || null,
        leadTypes: (data.leadTypeMappings || [])
          .map((m) => m.leadType)
          .filter(Boolean),
      };
    });

    return res.json({ forms: formatted });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch meta forms",
    });
  }
};

exports.getMetaLeads = async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);

  const { search, typeId, sort = "meta", campaign, adset, ad } = req.query;

  try {
    const where = {
      source: EXTERNAL_LEAD_SOURCE.META,
    };

    if (typeId && typeId !== "all") {
      where.type_id = typeId;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Campaign filter
    if (campaign && campaign !== "all") {
      where[Op.and] = [
        ...(where[Op.and] || []),
        sequelize.where(
          sequelize.json("additional_data.campaign_name"),
          campaign,
        ),
      ];
    }

    // Adset filter
    if (adset && adset !== "all") {
      where[Op.and] = [
        ...(where[Op.and] || []),
        sequelize.where(sequelize.json("additional_data.adset_name"), adset),
      ];
    }

    // Ad filter
    if (ad && ad !== "all") {
      where[Op.and] = [
        ...(where[Op.and] || []),
        sequelize.where(sequelize.json("additional_data.ad_name"), ad),
      ];
    }

    let order = [["external_created_at", "DESC"]];

    if (sort === "created") {
      order = [["createdAt", "DESC"]];
    }

    const { rows, count } = await ExternalLead.findAndCountAll({
      where,
      include: [
        {
          model: ExternalLeadType,
          as: "leadType",
          attributes: ["id", "name"],
        },
      ],
      attributes: [
        "id",
        "external_lead_id",
        "external_form_id",
        "external_created_at",
        "name",
        "email",
        "phone",
        "createdAt",
        "form_data",
        "additional_data",
      ],
      order,
      limit,
      offset,
    });

    return res.json({
      leads: rows,
      meta: getMeta(count, page, limit),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch leads",
    });
  }
};

exports.getMetaLeadFilters = async (req, res) => {
  try {
    const leads = await ExternalLead.findAll({
      where: { source: EXTERNAL_LEAD_SOURCE.META },
      attributes: ["additional_data"],
    });

    const campaigns = new Set();
    const adsets = new Set();
    const ads = new Set();

    leads.forEach((lead) => {
      const data = lead.additional_data || {};

      if (data.campaign_name) campaigns.add(data.campaign_name);
      if (data.adset_name) adsets.add(data.adset_name);
      if (data.ad_name) ads.add(data.ad_name);
    });

    return res.json({
      campaigns: [...campaigns],
      adsets: [...adsets],
      ads: [...ads],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch filters",
    });
  }
};
