const psEnv = require("@ps/env/tps");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: psEnv.EMAIL_HOST,
  port: psEnv.EMAIL_PORT,
  secure: false,
  auth: {
    user: psEnv.EMAIL_USER,
    pass: psEnv.EMAIL_PASSWORD,
  },
});

const adminEmails = psEnv.ADMIN_EMAILS.split(",");

async function sendAdminAlert(subject, message) {
  if (adminEmails.length > 0) {
    await transporter.sendMail({
      from: `"The Product Space" <no-reply@theproductspace.co.in>`,
      to: adminEmails,
      subject,
      text: message,
    });
  }
}

module.exports = { sendAdminAlert };
