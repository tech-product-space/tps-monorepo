const nodemailer = require("nodemailer");
const fs = require("fs");
const inviteEmailTemplate = require("../utils/inviteEmailTemplate");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendEmail = async (to, subject, content, isHtml = false) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      [isHtml ? "html" : "text"]: content,
    });
    console.log("Email sent: " + info.response);
  } catch (error) {
    console.error("Error sending email: ", error);
  }
};

function generateEmailHtml(inviteLink) {
  let emailTemplate = inviteEmailTemplate();
  emailTemplate = emailTemplate.replace(/\{\{inviteLink\}\}/g, inviteLink);
  return emailTemplate;
}

module.exports = {
  sendEmail,
  generateEmailHtml
};
