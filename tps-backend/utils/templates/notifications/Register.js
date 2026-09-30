const Register = ({ name, eventName, whatsappGroupLink, date }) => {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Registered for ${eventName}</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f9f9f9;">
      <table align="center" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#fff; border-radius:8px; margin:20px auto; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
        <tr>
          <td align="center" style="padding:20px;">
            <img src="https://tps-storage.s3.ap-south-1.amazonaws.com/blogs/product-space.png" width="150" />
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 10px; font-size:18px; font-weight:bold;">Hello, ${name} 👋</td>
        </tr>
        <tr>
          <td style="padding:0 30px 15px; font-size:16px; color:#333;">
            You’re officially registered for <strong>${eventName}</strong>!
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 15px; font-size:15px; color:#333;">
            We’re so excited to have you onboard in <strong>Product Teardown S12</strong>.
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 15px; font-size:15px; color:#333;">
            📌 <strong>Kick-off call is on ${date}, 11 AM (IST).</strong> We'll reveal the problem statement during the call along with a quick upskilling session on how to do product teardowns. Don’t miss it!
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 15px; font-size:15px; color:#333;">
            👉🏻 To stay updated, join our teardown group: <a href="${whatsappGroupLink}" style="color:#007bff;">Join Now</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 20px; font-size:15px; color:#333;">
            This competition is a launchpad for your product journey:
            <ul style="margin-top:10px; padding-left:20px;">
              <li>🔥 Solve real product problems from top companies</li>
              <li>🔥 Build portfolio-ready proof of work</li>
              <li>🔥 Get mentored by senior PMs from top product teams</li>
              <li>🔥 Compete with 1000+ PM aspirants and professionals</li>
            </ul>
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 15px; font-size:15px; color:#333;">
            Whether you're breaking into PM, prepping for interviews, or want to actually apply product thinking — this is where you start.
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 20px; font-size:15px; color:#333;">
            Let’s build something worth showing off.
          </td>
        </tr>
        <tr>
          <td style="text-align:center; padding:0 30px 30px;">
            <a href="${whatsappGroupLink}" style="display:inline-block; background:#25D366; color:#fff; padding:10px 20px; border-radius:5px; text-decoration:none;">Join WhatsApp Group</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 30px; font-size:14px; color:#777;">
            See you there!<br/><strong>Team Product Space</strong>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};

module.exports = Register;
