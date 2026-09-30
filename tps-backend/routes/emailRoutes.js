const express = require('express');
const nodemailer = require('nodemailer');
const notificationController = require('../controllers/notificationController');
const { generateCertificateEmail } = require("../utils/generateCertificateEmail")
const router = express.Router();

require('dotenv').config();

const emailHtml = (name) => generateCertificateEmail({
    name: name,
    certificateLink: "https://productspace.com/certificates/download/123456",
    linkedInLink: "https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME",
    courses: [
        {
            title: "Product Management Fellowship",
            startDate: "May 31, 2025",
            duration: "10 Weeks",
            features: ["Placement Assistance", "Real-World Projects", "Product Market Skills", "Personalized Mentorship"],
            description: "Master Strong Quantitative Product Management and Get Your Dream Role",
            enrollLink: "https://productspace.com/courses/product-management-fellowship",
        },
        {
            title: "Advanced AI for Product Management",
            startDate: "Jun 25, 2025",
            duration: "8 Weeks",
            features: ["Real-World Applications", "Cutting-Edge Tools", "Personalized Mentorship"],
            description: "Accelerate your Product Career With AI Skills and Gain the Edge That Only 5% PM Possess Currently",
            enrollLink: "https://productspace.com/courses/advanced-ai-product-management",
        },
    ],
})

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

router.post('/send', async (req, res) => {
    const { to, name } = req.body;
    try {

        await transporter.sendMail({
            from: '"The Product Space" <no-reply@theproductspace.co.in>',
            to: to,
            subject: "🎓 Your AI Product Management Certificate is Ready!",
            html: emailHtml(name),
        });


        res.status(200).json({ message: 'Test email sent successfully!' });
    } catch (error) {
        console.error('Email sending error:', error);
        res.status(500).json({ message: 'Failed to send email', error });
    }
});

router.post("/notification", notificationController.sendNotification);

router.post("/test", notificationController.sendTestNotification);

module.exports = router;