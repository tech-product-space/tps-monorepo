const emailTemplateService = require("../../services/emailTemplate.service");

exports.getAll = async (req, res) => {
  try {
    const templates = await emailTemplateService.getAllTemplates();
    res.json({ success: true, data: templates });
  } catch (err) {
    console.error("getAll templates error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch templates" });
  }
};

exports.getById = async (req, res) => {
  try {
    const template = await emailTemplateService.getTemplateById(req.params.id);
    res.json({ success: true, data: template });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, subject, html_body, type, course_id } = req.body;
    const template = await emailTemplateService.createTemplate({
      name,
      subject,
      html_body,
      created_by: req.user.id,
      type,
      course_id,
    });
    res.status(201).json({ success: true, data: template });
  } catch (err) {
    console.error("create template error:", err);
    const status = err.message.includes("required")
      ? 400
      : err.message.includes("unique") || err.message.includes("already")
        ? 409
        : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const template = await emailTemplateService.updateTemplate(
      req.params.id,
      req.body,
    );
    res.json({ success: true, data: template });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await emailTemplateService.deleteTemplate(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    const status = err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

exports.activate = async (req, res) => {
  try {
    const template = await emailTemplateService.setActiveTemplate(
      req.params.id,
    );
    res.json({ success: true, data: template });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

exports.deactivate = async (req, res) => {
  try {
    const template = await emailTemplateService.deactivateTemplate(
      req.params.id,
    );
    res.json({ success: true, data: template });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

exports.sendPreview = async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res
        .status(400)
        .json({ success: false, message: "'name' and 'email' is required" });
    }
    const result = await emailTemplateService.sendPreviewEmail({
      templateId: req.params.id,
      name,
      email,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("sendPreview error:", err);
    const status = err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

exports.getOnboardingCourses = async (_req, res) => {
  try {
    const courseIds = await emailTemplateService.listActiveOnboardingCourseIds();
    res.json({ success: true, data: courseIds });
  } catch (err) {
    console.error("getOnboardingCourses error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch onboarding courses" });
  }
};

exports.getVariables = async (_req, res) => {
  const data = Object.entries(emailTemplateService.TEMPLATE_VARIABLES_MAP).map(
    ([type, config]) => ({
      type,
      name: config.displayName,
      variables: config.variables,
    }),
  );

  res.json({ success: true, data });
};
