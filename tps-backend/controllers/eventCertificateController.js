const {
  CertificateTemplate,
  EventGuests,
  Event,
  users,
  sequelize,
} = require("../models");
const {
  replacePlaceholders,
  cleanHtml,
  wrapEmailTemplate,
} = require("../utils/email/htmlHelpers.js");
const { Op } = require("sequelize");

const {
  generateCertificateImage,
} = require("../utils/generateEventCertificate");
const { uploadImageToS3, getSignedS3Url } = require("../lib/s3");
const { capitalizeName } = require("../utils/capitalize");
const { sendGraphEmail } = require("../utils/email/sendGraphEmail.js");
const {
  approveCertificateService,
} = require("../service/events/eventCertificate.js");

// POST /events/certificate/save
exports.saveCertificateTemplate = async (req, res) => {
  try {
    const { eventId, certificateName, imageSize, fields, templateImage } =
      req.body;

    if (
      !eventId ||
      !certificateName ||
      !imageSize ||
      !fields ||
      !templateImage
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: eventId, certificateName, imageSize, fields, templateImage",
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

    // Check if event exists
    const event = await Event.findByPk(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: "Event not found",
      });
    }

    // Check if template already exists for this event
    const existingTemplate = await CertificateTemplate.findOne({
      where: { eventId },
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
      template = await CertificateTemplate.create({
        eventId,
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
  } catch (error) {
    console.error("Error saving certificate template:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// GET certificate template for an event
exports.getCertificateTemplate = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        error: "eventId is required",
      });
    }

    const template = await CertificateTemplate.findOne({
      where: { eventId },
      include: [
        {
          model: Event,
          as: "event",
          attributes: ["eventTitle", "eventSlug"],
        },
      ],
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Certificate template not found for this event",
      });
    }

    return res.status(200).json({
      success: true,
      template,
    });
  } catch (error) {
    console.error("Error fetching certificate template:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// POST /events/certificate/generate   ---> FRONTEND AT TIME OF SUBMITING FEEDBACK
exports.generateCertificate = async (req, res) => {
  try {
    const { eventId, userId } = req.body;

    if (!eventId || !userId) {
      return res.status(400).json({
        success: false,
        error: "eventId and userId are required",
      });
    }

    const eventGuest = await EventGuests.findOne({
      where: { eventId, userId, guestType: "Approved" },
      include: [
        {
          model: users,
          as: "user",
          attributes: ["name", "email"],
        },
      ],
    });

    if (!eventGuest) {
      return res.status(404).json({
        success: false,
        error: "User not registered for this event",
      });
    }

    if (eventGuest.certificateGenerated) {
      return res.status(400).json({
        success: true,
        message: "Certificate already generated",
        certificateUrl: eventGuest.certificateUrl,
      });
    }

    if (!eventGuest.certificateApproved) {
      return res.status(400).json({
        success: true,
        message: "Certificate not approved yet",
      });
    }

    // Get certificate template
    const template = await CertificateTemplate.findOne({
      where: { eventId },
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Certificate template not found for this event",
      });
    }

    const date = new Date();

    const certificateId = `PSCERT-E${eventId}G${eventGuest.id}`;
    const userData = {
      name:
        capitalizeName(eventGuest.name) ||
        capitalizeName(eventGuest.user?.name) ||
        "Participant",
      date: date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      certificateId,
    };

    const certificateBuffer = await generateCertificateImage(
      template,
      userData,
    );

    // Upload certificate to S3
    const fileName = `${certificateId}.png`;
    const key = `certificates/${fileName}`;
    await uploadImageToS3(certificateBuffer, key, "image/png");

    // Generate presigned URL for download
    const certificateUrl = await getSignedS3Url({
      key,
      disposition: "inline",
      filename: fileName,
      contentType: "image/png",
      expiresIn: 60 * 60, // 1 hours
    });

    // Update event guest with certificate info
    await eventGuest.update({
      certificateGenerated: true,
      certificateId,
      certificateName: template.certificateName,
      certificateGeneratedAt: date,
    });

    // send mail
    const { emailSubject, emailBody } = template;
    const userEmail = eventGuest.user.email;

    if (emailBody && userEmail) {
      const replacements = {
        recipientName: userData.name,
        ...userData,
      };

      const htmlContent = wrapEmailTemplate(
        cleanHtml(replacePlaceholders(emailBody, replacements)),
      );

      await sendGraphEmail({
        to: userEmail,
        subject: emailSubject || "",
        html: htmlContent,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Certificate generated successfully",
      data: {
        certificateGenerated: true,
        certificateId,
        certificateName: template.certificateName,
        certificateGeneratedAt: date,
        certificateUrl,
      },
    });
  } catch (error) {
    console.error("Error generating certificate:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// POST /events/certificate/bulk-generate
exports.bulkGenerateCertificates = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { eventId } = req.body;

    // 0. Validate Input
    if (!eventId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: "eventId is required",
      });
    }

    // 1. Validate Event Exists
    const event = await Event.findOne({
      where: { id: eventId },
      attributes: ["id", "eventType"],
      transaction,
    });

    if (!event) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: "Event not found",
      });
    }

    // 2. Get Certificate Template
    const template = await CertificateTemplate.findOne({
      where: { eventId },
      transaction,
    });

    if (!template) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: "Certificate template not found for this event",
      });
    }

    // Email Preparation
    const subject = template.emailSubject || "Your Certificate is Ready";

    const cleanedEmailBody = template.emailBody
      ? cleanHtml(template.emailBody)
      : null;

    // 3. Fetch Guests (Approved but Not Generated)
    const guests = await EventGuests.findAll({
      where: {
        eventId,
        guestType: "Approved",
        certificateApproved: true,
        certificateGenerated: false,
      },
      include: [
        {
          model: users,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
      transaction,
    });

    if (!guests.length) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: "No pending certificates found for generation",
      });
    }

    // 4. Track Results
    let generatedCount = 0;
    let failedCount = 0;

    const successGuestIds = [];
    const failedGuestIds = [];

    // 5. Loop and Generate Certificates
    for (const guest of guests) {
      try {
        const date = new Date();

        const certificateId = `PSCERT-E${eventId}G${guest.id}`;

        // Prepare User Data
        const userData = {
          name:
            capitalizeName(guest.name) ||
            capitalizeName(guest.user?.name) ||
            "Participant",

          date: date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),

          certificateId,
        };

        // Generate Certificate Image
        const certificateBuffer = await generateCertificateImage(
          template,
          userData,
        );

        // Upload to S3
        const fileName = `${certificateId}.png`;
        const key = `certificates/${fileName}`;

        await uploadImageToS3(certificateBuffer, key, "image/png");

        // Update Guest Record
        await guest.update(
          {
            certificateGenerated: true,
            certificateId,
            certificateName: template.certificateName,
            certificateGeneratedAt: date,
          },
          { transaction },
        );

        generatedCount++;
        successGuestIds.push(guest.id);

        // Send Email (Optimized)
        const userEmail = guest.user?.email;

        if (cleanedEmailBody && userEmail) {
          const replacements = {
            recipientName: userData.name,
            ...userData,
          };

          // Only placeholder replacement happens per guest
          const personalizedBody = replacePlaceholders(
            cleanedEmailBody,
            replacements,
          );

          // Wrap final HTML
          const htmlContent = wrapEmailTemplate(personalizedBody);

          sendGraphEmail({
            to: userEmail,
            subject,
            html: htmlContent,
          });
        }
      } catch (err) {
        console.error(
          `Certificate generation failed for Guest ID: ${guest.id}`,
          err,
        );

        failedCount++;
        failedGuestIds.push(guest.id);
      }
    }

    // 6. Commit Transaction
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Bulk certificate generation completed",
      stats: {
        totalGuests: guests.length,
        generatedCount,
        failedCount,
      },
      results: {
        successGuestIds,
        failedGuestIds,
      },
    });
  } catch (error) {
    await transaction.rollback();

    console.error("Bulk Generate Error:", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// POST /events/certificate/download-url   ---> FRONTEND at certificate tab to download the certifiacte
exports.getCertificateDownloadUrl = async (req, res) => {
  try {
    const { userId, eventId } = req.body;

    if (!userId || !eventId) {
      return res.status(400).json({
        success: false,
        error: "userId and eventId are required",
      });
    }

    // Find event guest
    const eventGuest = await EventGuests.findOne({
      where: { userId, eventId },
      include: [
        {
          model: Event,
          as: "event",
          attributes: ["eventTitle"],
        },
      ],
    });

    if (!eventGuest) {
      return res.status(404).json({
        success: false,
        error: "User not registered for this event",
      });
    }

    if (!eventGuest.certificateGenerated || !eventGuest.certificateId) {
      return res.status(404).json({
        success: false,
        error: "Certificate not generated for this user",
      });
    }

    const fileName = `${eventGuest.certificateId}.png`;
    const key = `certificates/${fileName}`;

    // Generate presigned URL for S3 object
    const certificateUrl = await getSignedS3Url({
      key,
      disposition: "attachment",
      filename: fileName,
      contentType: "image/png",
      expiresIn: 60 * 60, // 1 hour
    });

    return res.status(200).json({
      success: true,
      message: "Certificate download url generated successfully",
      certificateUrl,
    });
  } catch (error) {
    console.error("Error downloading certificate:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

//POST /events/certificate/my-certificates  ---> FRONTEND at certificate tab to map only
exports.getUserCertificates = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required",
      });
    }

    const certificates = await EventGuests.findAll({
      where: {
        userId,
        certificateGenerated: true,
      },
      include: [
        {
          model: Event,
          as: "event",
          attributes: ["id", "eventTitle", "eventSlug", "eventStartDate"],
        },
      ],
      attributes: [
        "certificateName",
        "certificateGeneratedAt",
        "certificateId",
      ],
      order: [["certificateGeneratedAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      certificates,
    });
  } catch (error) {
    console.error("Error fetching user certificates:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

//POST /events/certificate/latest-certificate
exports.getLatestCertificate = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required",
      });
    }

    // Fetch only the latest generated certificate
    const latestCertificate = await EventGuests.findOne({
      where: {
        userId,
        certificateGenerated: true,
      },
      include: [
        {
          model: Event,
          as: "event",
          attributes: ["id", "eventTitle", "eventSlug", "eventStartDate"],
        },
      ],
      attributes: [
        "certificateName",
        "certificateGeneratedAt",
        "certificateId",
      ],
      order: [["certificateGeneratedAt", "DESC"]],
    });

    if (!latestCertificate) {
      return res.status(404).json({
        success: false,
        message: "No certificate found for this user",
      });
    }

    return res.status(200).json({
      success: true,
      latestCertificate,
    });
  } catch (error) {
    console.error("Error fetching latest certificate:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

//PUT /events/certificate/approve
exports.approveCertificate = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { guestId } = req.body;

    if (!guestId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: "guestId is required",
      });
    }

    const result = await approveCertificateService(guestId, transaction);

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: result?.skipped
        ? "Certificate already approved"
        : "Certificate approved successfully",
    });
  } catch (error) {
    await transaction.rollback();

    console.error("Error approving certificate:", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// PUT /events/certificate/bulk-approve
exports.bulkApproveCertificates = async (req, res) => {
  try {
    const { eventId } = req.body;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        error: "eventId is required",
      });
    }

    // 1. Validate Event
    const event = await Event.findByPk(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: "Event not found",
      });
    }

    const where = {
      eventId,
      guestType: "Approved",
      certificateApproved: false,
    };

    if (event.eventType === "Workshop") {
      where.feedbackData = {
        [Op.ne]: null,
      };
    }

    // 2. valid guests for approving
    const guests = await EventGuests.findAll({
      attributes: ["id"],
      where,
    });

    let approved = [];
    let failed = [];

    // 3. Process each guest
    const batchSize = 50;

    for (let i = 0; i < guests.length; i += batchSize) {
      const batch = guests.slice(i, i + batchSize);
      const transaction = await sequelize.transaction();

      try {
        for (const guest of batch) {
          await approveCertificateService(guest.id, transaction, true);
        }

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Certificates approved successfully",
      stats: {
        approved,
        failed,
      },
    });
  } catch (error) {
    console.error("Bulk Approve Error:", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

//POST /events/certificate/save-email-template
exports.saveEventEmailTemplate = async (req, res) => {
  try {
    const { eventId, emailSubject, emailBody } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const template = await CertificateTemplate.findOne({
      where: { eventId },
    });

    if (!template) {
      return res.status(404).json({ error: "Certificate template not found" });
    }

    template.emailSubject = emailSubject;
    template.emailBody = emailBody;
    await template.save();

    res
      .status(200)
      .json({ message: "Email template saved successfully", data: template });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save email template" });
  }
};

//GET /events/certificate//email-template/:eventId
exports.getEmailTemplateByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const template = await CertificateTemplate.findOne({
      where: { eventId },
      attributes: [
        "id",
        "eventId",
        "certificateName",
        "emailSubject",
        "emailBody",
      ],
    });

    if (!template) {
      return res
        .status(404)
        .json({ error: "No certificate email template found for this event" });
    }

    res.status(200).json({ success: true, data: template });
  } catch (error) {
    console.error("Error fetching email template:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch certificate email template" });
  }
};

exports.sendCertificateTestEmail = async (req, res) => {
  try {
    const { eventId, email } = req.body;

    // Validate input
    if (!eventId || !email) {
      return res.status(400).json({
        success: false,
        error: "Both eventId and email are required",
      });
    }

    // Find the template by eventId
    const template = await CertificateTemplate.findOne({ where: { eventId } });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Certificate template not found for this event",
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
  } catch (error) {
    console.error("Error sending test email:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
