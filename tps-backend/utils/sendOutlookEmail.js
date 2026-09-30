const nodemailer = require("nodemailer");
const teardownEmailTemplate = require("../utils/teardownEmailTemplate");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

/**
 * Generates HTML email content using the provided details.
 * @param {string} name - Recipient's name
 * @param {string} inviteLink - Invitation or join link
 * @param {string} title - Email subject and content heading
 * @returns {string} HTML content
 */
function generateEmailHtml(name, inviteLink, title) {
  return teardownEmailTemplate({ name, inviteLink, title });
}

/**
 * Sends an email using the configured transporter
 * @param {string} to - Recipient's email address
 * @param {string} subject - Email subject
 * @param {string} content - Email content (HTML or text)
 * @param {boolean} isHtml - Set to true for HTML content
 */
const sendEmail = async (to, subject, content, isHtml = false) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      [isHtml ? "html" : "text"]: content,
    });
    console.log("✅ Email sent: " + info.response);
  } catch (error) {
    console.error("❌ Error sending email:", error);
  }
};

module.exports = {
  sendEmail,
  generateEmailHtml,
};
