const teardownEmailTemplate = ({ name = "Participant", inviteLink = "#", title = "Registration Confirmed for Product Teardown Season 12!" }) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>${title}</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        margin: 0;
        padding: 0;
        color: #333;
      }
      .container {
        max-width: 600px;
        margin: 40px auto;
        background-color: #ffffff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 10px rgba(0,0,0,0.05);
      }
      .header {
        background-color: #4f46e5;
        color: #ffffff;
        padding: 30px;
        text-align: center;
        font-size: 24px;
        font-weight: bold;
      }
      .content {
        padding: 30px;
      }
      .content h2 {
        font-size: 22px;
        margin: 0 0 20px 0;
      }
      .content p {
        line-height: 1.6;
        margin: 10px 0;
      }
      .cta {
        text-align: center;
        margin: 30px 0;
      }
      .cta a {
        background-color: #4f46e5;
        color: white;
        padding: 14px 28px;
        text-decoration: none;
        border-radius: 4px;
        font-weight: bold;
      }
      .footer {
        text-align: center;
        font-size: 12px;
        color: #999999;
        padding: 20px;
        background-color: #f9f9f9;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        Product Space
      </div>
      <div class="content">
        <h2>${title}</h2>
        <p>Hi ${name},</p>
        <p>Welcome to the <strong>Product Teardown Competition Season 12</strong> by Product Space. 🚀</p>
        <p>In this competition, you’ll:</p>
        <ul>
          <li>Get hands-on experience solving real product problems</li>
          <li>Build your product portfolio with case work</li>
          <li>Win prizes and build your personal brand in product management domain</li>
        </ul>
        <p><strong>👉 What’s next?</strong><br/>
        Join the Teardown group for all announcements, team matchmaking, and daily updates.</p>
        <p><strong>Competition kicks off on 26th July – be ready to team up, learn and build products!</strong></p>

        <div class="cta">
          <a href="${inviteLink}" target="_blank">Join Teardown Group</a>
        </div>

        <p>If the button above doesn’t work, copy and paste this link in your browser:<br/>
        <a href="${inviteLink}">${inviteLink}</a></p>
      </div>
      <div class="footer">
        &copy; 2025 Product Space. All rights reserved.
      </div>
    </div>
  </body>
  </html>
`;

module.exports = teardownEmailTemplate;
