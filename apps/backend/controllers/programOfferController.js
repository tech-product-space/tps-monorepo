const { ProgramOffer } = require("../models");
const { sendGraphEmailSecondary } = require('../utils/email/sendGraphEmailSecondary');

const replacePlaceholders = (body, replacements) => {
    const withValues = body.replace(/{{(.*?)}}/g, (_, key) => {
        return replacements[key.trim()] ?? "";
    });

    // Convert newlines to <br> for HTML emails
    return withValues.replace(/\n/g, "<br>");
};

const cleanHtml = (html) => {
    return html
        .replace(/white-space:\s*pre-wrap;?/g, "")
        .replace(/white-space:\s*pre;?/g, "")
        .replace(/<p\b[^>]*>/gi, "<div>")   // replace opening <p ...> with <div>
        .replace(/<\/p>/gi, "</div>");       // replace closing </p> with </div>
};

const wrapEmailTemplate = (content) => {
    return `
  <style>
    @media only screen and (max-width: 600px) {
      .tps-pad { padding-left: 0 !important; padding-right: 0 !important; }
    }
  </style>

  <div style="background-color: #f3f4f6; width: 100%;">
    <div class="tps-pad" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 24px; font-size: 14px; font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      ${content}
    </div>
  </div>
  `;
};

// Create or update a program offer
exports.upsertProgramOffer = async (req, res) => {
    const {
        program_name,
        offer_valid_for,
        price,
        discount,
        cohort_seats,
        start_date,
        duration,
        offer_valid_till,
        brochure_link,
        usd_price,
        usd_discount,
        emi_amount,
        usd_emi_amount,
        tax_inclusive,
        usd_tax_inclusive,
    } = req.body;

    try {
        const [offer, created] = await ProgramOffer.upsert(
            {
                program_name,
                offer_valid_for,
                price,
                discount,
                cohort_seats,
                start_date,
                duration,
                offer_valid_till,
                brochure_link,
                usd_price,
                usd_discount,
                emi_amount,
                usd_emi_amount,
                tax_inclusive,
                usd_tax_inclusive,
            },
            {
                returning: true,
                conflictFields: ['program_name'],
            }
        );

        res.status(200).json({
            message: created ? "Program offer created" : "Program offer updated",
            data: offer,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
};

// Get a program offer by program name
exports.getProgramOffer = async (req, res) => {
    const { program_name } = req.params;

    try {
        const offer = await ProgramOffer.findOne({
            where: { program_name },
            attributes: [
                "program_name",
                "offer_valid_for",
                "price",
                "discount",
                "cohort_seats",
                "start_date",
                "duration",
                "offer_valid_till",
                "usd_price",
                "usd_discount",
                "emi_amount",
                "usd_emi_amount",
                "tax_inclusive",
                "usd_tax_inclusive",
            ],
        });

        if (!offer) {
            return res.status(404).json({
                message: "Program offer not found",
            });
        }

        return res.status(200).json(offer);
    } catch (error) {
        console.error("Error fetching program offer:", error);
        return res.status(500).json({
            message: "Server error",
        });
    }
};

// 🔹 Upsert enrollmentEmail
exports.upsertEnrollmentEmail = async (req, res) => {
    try {
        const { program_name } = req.params;
        const { enrollmentEmail } = req.body;

        const programOffer = await ProgramOffer.findOne({ where: { program_name } });

        if (!programOffer) {
            return res.status(404).json({ error: "ProgramOffer not found" });
        }

        await programOffer.update({ enrollmentEmail });

        return res.status(200).json({ program_name, enrollmentEmail });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Something went wrong" });
    }
};

// 🔹 Get enrollmentEmail
exports.getEnrollmentEmail = async (req, res) => {
    try {
        const { program_name } = req.params;

        const programOffer = await ProgramOffer.findOne({
            where: { program_name },
            attributes: ["program_name", "enrollmentEmail"]
        });

        if (!programOffer) {
            return res.status(404).json({ error: "ProgramOffer not found" });
        }

        return res.status(200).json(programOffer);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Something went wrong" });
    }
};

// 🔹 Upsert downloadCurriculum
exports.upsertDownloadCurriculum = async (req, res) => {
    try {
        const { program_name } = req.params;
        const { downloadCurriculum } = req.body;

        const programOffer = await ProgramOffer.findOne({ where: { program_name } });

        if (!programOffer) {
            return res.status(404).json({ error: "ProgramOffer not found" });
        }

        await programOffer.update({ downloadCurriculum });

        return res.status(200).json({ program_name, downloadCurriculum });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Something went wrong" });
    }
};

// 🔹 Get downloadCurriculum
exports.getDownloadCurriculum = async (req, res) => {
    try {
        const { program_name } = req.params;

        const programOffer = await ProgramOffer.findOne({
            where: { program_name },
            attributes: ["program_name", "downloadCurriculum"]
        });

        if (!programOffer) {
            return res.status(404).json({ error: "ProgramOffer not found" });
        }

        return res.status(200).json(programOffer);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Something went wrong" });
    }
};

// Send curriculum or enrollment email
exports.sendCurriculumEmail = async (req, res) => {
    try {
        const { program_name, userEmail, userName, type } = req.body;

        if (!program_name || !userEmail) {
            return res.status(400).json({ error: "program_name and userEmail are required" });
        }

        // decide which field to fetch
        const field = type === "email" ? "enrollmentEmail" : "downloadCurriculum";

        // get program offer with the correct field
        const programOffer = await ProgramOffer.findOne({
            where: { program_name },
            attributes: ["program_name", field],
        });

        if (!programOffer || !programOffer[field]) {
            return res.status(404).json({ error: `No ${field} found for this program` });
        }

        // Pull template fields from DB JSON
        const { subject, body } = programOffer[field];

        if (!subject || !body) {
            return res.status(400).json({ error: `${field} template incomplete` });
        }

        // Replace placeholders like {{name}}
        const htmlContent = wrapEmailTemplate(
            cleanHtml(
                replacePlaceholders(body, { name: userName || "Student" })
            )
        );

        // Send email
        await sendGraphEmailSecondary({
            to: userEmail,
            subject,
            html: htmlContent,
        });

        res.status(200).json({ message: `${field} email sent to ${userEmail}` });
    } catch (error) {
        console.error("Error sending curriculum email:", error);
        res.status(500).json({ error: "Failed to send email", details: error.message });
    }
};

exports.getAllProgramOffers = async (req, res) => {
    try {
        const programOffers = await ProgramOffer.findAll({
            attributes: {
                exclude: ['id', 'enrollmentEmail', 'brochure_link', 'downloadCurriculum', 'createdAt', 'updatedAt']
            },
            order: [['createdAt', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            data: programOffers
        });
    } catch (error) {
        console.error('Error fetching program offers:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch program offers'
        });
    }
};