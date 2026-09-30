const {
  ExternalLeadType,
  ExternalLead,
  MetaLeadFormMapping,
  MetaLeadForm,
} = require("../../models");

const { Op } = require("sequelize");

exports.createLeadType = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Lead type name is required",
      });
    }

    const existing = await ExternalLeadType.findOne({
      where: {
        name: {
          [Op.iLike]: name,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        message: "Lead type already exists",
      });
    }

    const leadType = await ExternalLeadType.create({
      name,
      description,
    });

    return res.json({
      message: "Lead type created successfully",
      leadType,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create lead type",
    });
  }
};

exports.getLeadTypes = async (req, res) => {
  try {
    const types = await ExternalLeadType.findAll({
      attributes: ["id", "name", "description", "createdAt"],
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      types,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch lead types",
    });
  }
};

exports.assignMetaFormToLeadTypes = async (req, res) => {
  const { typeIds, formId } = req.body;

  try {
    const form = await MetaLeadForm.findByPk(formId);

    if (!form) {
      return res.status(404).json({
        message: "Meta form not found",
      });
    }

    if (!Array.isArray(typeIds)) {
      return res.status(400).json({
        message: "typeIds must be an array",
      });
    }

    // Remove mappings not selected
    await MetaLeadFormMapping.destroy({
      where: {
        meta_form_id: formId,
        lead_type_id: {
          [Op.notIn]: typeIds
        }
      }
    });

    // Insert new mappings
    await MetaLeadFormMapping.bulkCreate(
      typeIds.map(id => ({
        meta_form_id: formId,
        lead_type_id: id
      })),
      { ignoreDuplicates: true }
    );

    return res.json({
      message: "Forms mapped successfully",
      mappedTypes: typeIds
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to map forms",
    });
  }
};
