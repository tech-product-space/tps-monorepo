const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const adminEmails = process.env.ADMIN_EMAILS.split(",");

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
