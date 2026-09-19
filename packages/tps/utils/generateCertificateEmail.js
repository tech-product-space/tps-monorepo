function generateCertificateEmail({ name, certificateLink, linkedInLink, courses = [] }) {
  if (!courses.length) {
    courses = [
      {
        title: "Product Management Fellowship",
        startDate: "May 31, 2025",
        duration: "10 Weeks",
        features: ["Placement Assistance", "Real-World Projects", "Product Market Skills", "Personalized Mentorship"],
        description: "Master Strong Quantitative Product Management and Get Your Dream Role",
        enrollLink: "#",
      },
      {
        title: "Advanced AI for Product Management",
        startDate: "Jun 25, 2025",
        duration: "8 Weeks",
        features: ["Real-World Applications", "Cutting-Edge Tools", "Personalized Mentorship"],
        description:
          "Accelerate your Product Career With AI Skills and Gain the Edge That Only 5% PM Possess Currently",
        enrollLink: "#",
      },
    ];
  }

  const coursesHTML = courses.map(course => `
        <td class="course-column" style="width: 50%; padding: 10px; vertical-align: top;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" class="course-card" style="background-color:rgb(236, 242, 253); border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; height: 100%; table-layout: fixed;">
                <tr>
                    <td style="background-color: #3b68b8; padding: 15px; border-radius: 8px 8px 0 0;">
                        <div style="color: white; font-size: 16px; font-weight: bold;">${course.title}</div>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 10px 15px; border-bottom: 1px solid #eaeaea;">
                        <span style="color: #666; font-size: 12px;">Cohort Starts From:</span> <span style="font-weight: bold; font-size: 12px;">${course.startDate}</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 15px;">
                        <div style="font-weight: bold; margin-bottom: 10px;">${course.title}</div>
                        <ul style="padding-left: 20px; margin: 10px 0; color: #555; font-size: 13px;">
                            ${course.features.map(f => `<li>${f}</li>`).join("")}
                        </ul>
                        <p style="font-size: 13px; color: #555; margin: 10px 0;">${course.description}</p>
                        <div style="margin-top: 15px; text-align: center;">
                            <a href="${course.enrollLink}" style="display: inline-block; background-color: #3b68b8; color: white; padding: 8px 15px; text-decoration: none; border-radius: 4px; font-size: 13px;">Explore The Course</a>
                            <div style="margin-top: 10px; color: #666; font-size: 12px;">Course Duration: <b>${course.duration}</b></div>
                        </div>
                    </td>
                </tr>
            </table>
        </td>
    `).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Certificate Email</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      width: 100%;
      max-width: 800px;
      margin: auto;
      background-color: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
    }
    .header {
      background-color: #3b68b8;
      color: #fff;
      padding: 20px;
      text-align: center;
      border-radius: 10px 10px 0 0;
    }
    .main {
      padding: 30px;
      background-color:rgb(255, 255, 255);
    }
    .btn {
      display: inline-block;
      background-color: #3b68b8;
      color: white !important;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 4px;
      font-weight: bold;
      font-size: 16px;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .course-grid {
      width: 100%;
      table-layout: fixed;
      border-spacing: 0;
    }
    .course-column {
      vertical-align: top;
    }

    @media screen and (max-width: 600px) {
      .course-column {
        display: block;
        width: 100% !important;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>The Product Space</h1>
    </div>
    <div class="main">
      <h2>Congratulations, ${name}!</h2>
      <p>You've just completed the AI Product Management Assessment—<b>and earned your certificate!</b></p>
      <p>You're now part of a growing community of forward-thinking Product Managers ready for the next era of AI-powered products.</p>

      <div class="button-container">
        <a href="${certificateLink}" class="btn" target="_blank">Download Your Certificate</a>
      </div>

      <h3>🎉 Share Your Success!</h3>
      <p>Let your network know—add your certificate to LinkedIn with just one click:</p>
      <div class="button-container">
        <a href="${linkedInLink}" class="btn" style="font-size: 14px;">Add to LinkedIn</a>
      </div>

      <h3>Take Your Next Step in Career Growth:</h3>
      <table class="course-grid" cellpadding="0" cellspacing="0">
        <tr>
          ${coursesHTML}
        </tr>
      </table>

      <p style="margin-top: 30px; font-size: 16px;">
        Thank you for growing with us, ${name}!<br/>
        <b>Onward and upward,</b><br/>
        The Product Space Team
      </p>
    </div>
    <div style="padding: 20px 30px; font-size: 12px; color: #666; border-top: 1px solid #ddd;">
      <p>© 2025 The Product Space. All rights reserved.</p>
      <p>If you didn't request this certificate or have questions, please reply to this email.</p>
    </div>
  </div>
</body>
</html>
`
}

module.exports = { generateCertificateEmail };
