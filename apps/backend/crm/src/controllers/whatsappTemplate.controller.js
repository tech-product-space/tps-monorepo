const whatsappTemplateService = require("../services/whatsappTemplate.service");

function statusFromError(err) {
  if (err.message.includes("not found")) return 404;
  if (err.message.includes("Not allowed")) return 403;
  if (err.message.includes("required")) return 400;
  return 500;
}

exports.getAll = async (req, res) => {
  try {
    const templates = await whatsappTemplateService.listTemplates(req.user);
    res.json({ success: true, data: templates });
  } catch (err) {
    console.error("getAll whatsapp templates error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch templates" });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, body, is_default } = req.body;
    const template = await whatsappTemplateService.createTemplate({
      name,
      body,
      is_default,
      user: req.user,
    });
    res.status(201).json({ success: true, data: template });
  } catch (err) {
    console.error("create whatsapp template error:", err);
    res.status(statusFromError(err)).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const template = await whatsappTemplateService.updateTemplate(
      req.params.id,
      req.body,
      req.user,
    );
    res.json({ success: true, data: template });
  } catch (err) {
    console.error("update whatsapp template error:", err);
    res.status(statusFromError(err)).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await whatsappTemplateService.deleteTemplate(req.params.id, req.user);
    res.json({ success: true });
  } catch (err) {
    console.error("delete whatsapp template error:", err);
    res.status(statusFromError(err)).json({ success: false, message: err.message });
  }
};

exports.getVariables = async (_req, res) => {
  res.json({
    success: true,
    data: {
      variables: whatsappTemplateService.TEMPLATE_VARIABLES,
      maxBodyLength: whatsappTemplateService.MAX_BODY_LENGTH,
    },
  });
};
