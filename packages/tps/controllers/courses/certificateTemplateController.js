const { Course, CourseCertificateTemplate } = require("../../models");
const { wrapEmailTemplate, cleanHtml, replacePlaceholders } = require("../../utils/email/htmlHelpers");
const { sendGraphEmail } = require("../../utils/email/sendGraphEmail");

module.exports = {
  // POST /courses/:courseId/certificate/template
  async saveCertificateTemplate(req, res) {
    const { courseId } = req.params;

    const { certificateName, imageSize, fields, templateImage } = req.body;

    if (
      !courseId ||
      !certificateName ||
      !imageSize ||
      !fields ||
      !templateImage
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: courseId, certificateName, imageSize, fields, templateImage",
      });
    }

    const base64Size = (templateImage.length * 3) / 4;
    const maxSize = 1.05 * 1024 * 1024; // 1MB

    if (base64Size > maxSize) {
      return res.status(400).json({
        success: false,
        error: `Image size exceeds 1MB limit. Current size: ${(
          base64Size /
          (1024 * 1024)
        ).toFixed(2)}MB`,
      });
    }

    // Check if course exists
    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        error: "Course not found",
      });
    }

    // Check if template already exists for this course
    const existingTemplate = await CourseCertificateTemplate.findOne({
      where: { courseId },
    });

    let template;
    if (existingTemplate) {
      // Update existing template
      await existingTemplate.update({
        certificateName,
        imageSize,
        fields,
        templateImage,
      });
      template = existingTemplate;
    } else {
      // Create new template
      template = await CourseCertificateTemplate.create({
        courseId,
        certificateName,
        imageSize,
        fields,
        templateImage,
      });
    }

    return res.status(200).json({
      success: true,
      message: existingTemplate
        ? "Template updated successfully"
        : "Template saved successfully",
      template,
    });
  },

  // GET /courses/:courseId/certificate/template
  async getCertificateTemplate(req, res) {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        error: "courseId is required",
      });
    }

    // Check if course exists
    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        error: "Course not found",
      });
    }

    // Fetch certificate template
    const template = await CourseCertificateTemplate.findOne({
      where: { courseId },
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Certificate template not found for this course",
      });
    }

    return res.status(200).json({
      success: true,
      template,
    });
  },

  //POST /courses/:courseId/certificate/save-email-template
  async saveEmailTemplate(req, res) {
    const { courseId } = req.params;
    const { emailSubject, emailBody } = req.body;

    if (!courseId) {
      return res.status(400).json({ error: "courseId is required" });
    }

    const template = await CourseCertificateTemplate.findOne({
      where: { courseId },
    });

    if (!template) {
      return res.status(404).json({ error: "Certificate template not found" });
    }

    template.emailSubject = emailSubject;
    template.emailBody = emailBody;
    await template.save();

    res.status(200).json({ success: true, data: template });
  },

  //GET /courses/:courseId/certificate/email-template
  async getEmailTemplateByCourseId(req, res) {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({ error: "courseId is required" });
    }

    const template = await CourseCertificateTemplate.findOne({
      where: { courseId },
      attributes: [
        "id",
        "courseId",
        "certificateName",
        "emailSubject",
        "emailBody",
      ],
    });

    if (!template) {
      return res
        .status(404)
        .json({ error: "No certificate email template found for this course" });
    }

    res.status(200).json({ success: true, data: template });
  },

  //POST /courses/:courseId/certificate/send-test-email
  async sendCertificateTestEmail(req, res) {
    const { courseId } = req.params;
    const { email } = req.body;

    // Validate input
    if (!courseId || !email) {
      return res.status(400).json({
        success: false,
        error: "Both courseId and email are required",
      });
    }

    // Find the template by courseId
    const template = await CourseCertificateTemplate.findOne({ where: { courseId } });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Certificate template not found for this course",
      });
    }

    const { emailSubject, emailBody } = template;

    if (!emailBody) {
      return res.status(400).json({
        success: false,
        error: "No email body defined in the certificate template",
      });
    }

    // Only replace the name in the email body
    const replacements = {
      recipientName: "Test User",
      name: "Test User",
    };

    const htmlContent = wrapEmailTemplate(
      cleanHtml(replacePlaceholders(emailBody, replacements)),
    );

    // Send the email
    await sendGraphEmail({
      to: email,
      subject: emailSubject || "Test Certificate Email",
      html: htmlContent,
    });

    return res.status(200).json({
      success: true,
      message: `Test email successfully sent to ${email}`,
    });
  },

};
