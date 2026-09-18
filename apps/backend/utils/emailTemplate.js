function generateCertificateEmail({ name, certificateUrl, linkedinUrl }) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding: 20px; font-family: Arial, sans-serif;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td align="center" style="background-color: #2a61c3; padding: 20px;">
              <h1 style="color: white; margin: 0;">The Product Space</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px; color: #333;">
              <h2>Congratulations, ${name}!</h2>
              <p>You've just completed the <strong>AI Product Management Assessment</strong>—<strong>and earned your certificate!</strong></p>
              <p>You’re now part of a growing community of forward-thinking Product Managers ready for the next era of AI-powered products. We’re thrilled to recognize your achievement.</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${certificateUrl}" style="background-color: #2a61c3; color: white; padding: 14px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  [ Download Your Certificate ]
                </a>
              </div>

              <h3>🚀 Share Your Success!</h3>
              <p>Proud of your achievement?<br>
              Let your network know—add your certificate to LinkedIn with just one click:</p>

              <div style="text-align: center; margin: 20px 0;">
                <a href="${linkedinUrl}" style="background-color: #0077b5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  Add to LinkedIn
                </a>
              </div>

              <h3>Take Your Next Step in career growth:</h3>

              <div style="display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 250px; background-color: #f4f4f4; padding: 10px; border-radius: 8px;">
                  <img src="https://via.placeholder.com/250x150?text=Product+Management+Fellowship" width="100%" style="border-radius: 8px;">
                  <h4>Product Management Fellowship</h4>
                  <p><strong>Starts:</strong> May 31, 2025<br>
                  Hands-on PM skills + Placement</p>
                  <a href="#" style="color: #2a61c3; text-decoration: underline;">Explore the Course</a>
                </div>
                <div style="flex: 1; min-width: 250px; background-color: #f4f4f4; padding: 10px; border-radius: 8px;">
                  <img src="https://via.placeholder.com/250x150?text=Advanced+AI+for+PM" width="100%" style="border-radius: 8px;">
                  <h4>Advanced AI for Product Management</h4>
                  <p><strong>Starts:</strong> Jun 21, 2025<br>
                  AI Tools + Strategy for PMs</p>
                  <a href="#" style="color: #2a61c3; text-decoration: underline;">Explore the Course</a>
                </div>
              </div>

              <p style="margin-top: 30px;">
                Thank you for growing with us, ${name}!<br>
                <strong>Onward and upward,<br>The Product Space Team</strong>
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;" />

              <p style="font-size: 14px; color: #777;">
                If the buttons above don’t work, you can copy and paste these links into your browser:<br>
                Certificate: <a href="${certificateUrl}">${certificateUrl}</a><br>
                LinkedIn Share: <a href="${linkedinUrl}">${linkedinUrl}</a>
              </p>

              <p style="font-size: 12px; color: #aaa;">© 2025 The Product Space. All rights reserved.<br>
              If you didn’t request this certificate or have questions, please reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `;
}
