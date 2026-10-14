const { uploadImageToS3, getSignedS3Url, getS3ObjectMetadata } = require("../../lib/s3");
// Increment when an older stored image must be rendered again.
const CURRENT_RENDER_VERSION = 1;
const CERTIFICATE_METADATA = { "render-version": String(CURRENT_RENDER_VERSION) };
const {
  Course,
  UserCourseCertificate,
  CourseCertificateTemplate,
  CourseEnrollment,
  users,
} = require("../../models");
const { capitalizeName } = require("../../utils/capitalize");
const {
  wrapEmailTemplate,
  cleanHtml,
  replacePlaceholders,
} = require("../../utils/email/htmlHelpers");
const { renderIfTemplate } = require("../../utils/email/templateHtml");
const { sendGraphEmail } = require("../../utils/email/sendGraphEmail");
const {
  generateCertificateImage,
} = require("../../utils/generateEventCertificate");
const {
  generateUniqueCertificateId,
} = require("../../utils/generateUniqueCertificateId");

module.exports = {
  // POST /courses/:courseId/certificate/generate
  async generateCourseCertificate(req, res) {
    const { courseId } = req.params;
    const { userId } = req.body;

    if (!courseId || !userId) {
      return res.status(400).json({
        success: false,
        error: "courseId and userId are required",
      });
    }

    // Check if certificate already exists for this user + course
    const existingCertificate = await UserCourseCertificate.findOne({
      where: {
        user_id: userId,
        course_id: courseId,
      },
    });

    if (existingCertificate) {
      return res.status(400).json({
        success: false,
        error: "Certificate already generated for this user",
      });
    }

    // Fetch user enrollment
    const enrollment = await CourseEnrollment.findOne({
      where: {
        user_id: userId,
        course_id: courseId,
      },
      include: [
        {
          model: users,
          as: "user",
          attributes: ["name", "email"],
        },
      ],
    });

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        error: "User not enrolled for this course",
      });
    }

    // Get certificate template
    const template = await CourseCertificateTemplate.findOne({
      where: { courseId },
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Certificate template not found for this course",
      });
    }

    // Generate certificate ID (public)
    const certificateId = await generateUniqueCertificateId();

    const date = new Date();

    const userData = {
      name:
        capitalizeName(enrollment.name) ||
        capitalizeName(enrollment.user?.name) ||
        "Participant",
      date: date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      certificateId,
    };

    // Generate certificate image (buffer)
    const certificateBuffer = await generateCertificateImage(
      template,
      userData,
    );

    // Upload to S3
    const fileName = `${certificateId}.png`;
    const key = `certificates/free-course/${fileName}`;

    await uploadImageToS3(certificateBuffer, key, "image/png", CERTIFICATE_METADATA);

    // Generate signed URL (optional)
    const certificateUrl = await getSignedS3Url({
      key,
      disposition: "inline",
      filename: fileName,
      contentType: "image/png",
      expiresIn: 60 * 60, // 1 hour
    });

    // Save certificate record
    const newCertificate = await UserCourseCertificate.create({
      certificate_id: certificateId,
      user_id: userId,
      course_id: courseId,
      certificate_template_id: template.id,
    });

    // send mail
    const { emailSubject, emailBody } = template;
    const userEmail = enrollment.user.email;

    if (emailBody && userEmail) {
      const replacements = {
        recipientName: userData.name,
        ...userData,
      };

      // Library-template bodies are sent as-is; the certificate's own
      // placeholders are filled either way.
      const htmlContent =
        renderIfTemplate(emailBody, {
          name: userData.name,
          email: userEmail,
          values: replacements,
        }) ??
        wrapEmailTemplate(
          cleanHtml(replacePlaceholders(emailBody, replacements)),
        );

      sendGraphEmail({
        to: userEmail,
        subject: emailSubject || "",
        html: htmlContent,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Certificate generated successfully",
      certificate: {
        id: newCertificate.id,
        certificateId,
        certificateUrl,
      },
    });
  },

  // GET /courses/:courseId/certificate/download-url?userId=<userid>
  async getCertificateDownloadUrl(req, res) {
    const { courseId } = req.params;
    const { userId } = req.query;

    if (!courseId || !userId) {
      return res.status(400).json({
        success: false,
        error: "courseId and userId are required",
      });
    }

    // Find certificate for this user + course
    const certificate = await UserCourseCertificate.findOne({
      where: {
        user_id: userId,
        course_id: courseId,
      },
      attributes: ["certificate_id", "createdAt"],
    });

    if (!certificate) {
      return res.status(404).json({
        success: false,
        error: "Certificate not found",
      });
    }

    const fileName = `${certificate.certificate_id}.png`;
    const key = `certificates/free-course/${fileName}`;

    const metadata = await getS3ObjectMetadata(key);
    const storedVersion = Number(metadata?.["render-version"]);
    if (!Number.isInteger(storedVersion) || storedVersion < CURRENT_RENDER_VERSION) {
      // Repair legacy images once, preserving the issued identity/date.
      const template = await CourseCertificateTemplate.findOne({ where: { courseId } });
      if (!template) {
        return res.status(404).json({ success: false, error: "Certificate template not found for this course" });
      }
      const enrollment = await CourseEnrollment.findOne({
        where: { user_id: userId, course_id: courseId },
        include: [{ model: users, as: "user", attributes: ["name"] }],
      });
      const name = capitalizeName(enrollment?.name) || capitalizeName(enrollment?.user?.name);
      if (!name) {
        return res.status(400).json({ success: false, error: "Certificate recipient name is missing" });
      }
      const issuedAt = new Date(certificate.createdAt);
      if (!certificate.createdAt || Number.isNaN(issuedAt.getTime())) {
        return res.status(400).json({ success: false, error: "Certificate issue date is missing" });
      }
      const certificateBuffer = await generateCertificateImage(template, {
        name,
        certificateId: certificate.certificate_id,
        date: issuedAt.toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric",
        }),
      });
      // The version and PNG are written together; failed uploads remain retryable.
      await uploadImageToS3(certificateBuffer, key, "image/png", CERTIFICATE_METADATA);
    }

    // Generate signed URL
    const certificateUrl = await getSignedS3Url({
      key,
      disposition: "attachment",
      filename: fileName,
      contentType: "image/png",
      expiresIn: 60 * 60, // 1 hour
      cacheControl: "no-store",
    });

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      certificateUrl,
    });
  },

  // GET /courses/certificate/my-certificates?userId=<userid>
  async getUserCertificates(req, res) {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required",
      });
    }

    const certificates = await UserCourseCertificate.findAll({
      where: {
        user_id: userId,
      },
      attributes: [ "createdAt"],
      include: [
        {
          model: CourseCertificateTemplate,
          as: "template",
          attributes: ["certificateName"],
        },
        {
          model: Course,
          as: "course",
          attributes: ["id", "title", "slug"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const formattedCertificates = certificates.map((cert) => ({
      certificateId: cert.certificate_id,
      certificateGeneratedAt: cert.createdAt,
      certificateName: cert.template?.certificateName || null,
      course: cert.course || null,
    }));

    return res.status(200).json({
      success: true,
      certificates: formattedCertificates,
    });
  },
};
