const psEnv = require("@ps/env/tps");
const nodemailer = require("nodemailer");
const fs = require("fs");
const inviteEmailTemplate = require("../utils/inviteEmailTemplate");

const transporter = nodemailer.createTransport({
  host: psEnv.EMAIL_HOST,
  port: Number(psEnv.EMAIL_PORT),
  secure: false,
  auth: {
    user: psEnv.EMAIL_USER,
    pass: psEnv.EMAIL_PASSWORD,
  },
});

const sendEmail = async (to, subject, content, isHtml = false) => {
  try {
    const info = await transporter.sendMail({
      from: psEnv.EMAIL_USER,
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
