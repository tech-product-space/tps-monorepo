const Approved = ({ name, eventName, whatsappGroupLink }) => {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ${eventName}</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f9f9f9;">
      <table align="center" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#fff; border-radius:8px; margin:20px auto; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
        <tr>
          <td align="center" style="padding:20px;">
            <img src="https://tps-storage.s3.ap-south-1.amazonaws.com/blogs/product-space.png" width="150" />
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 10px; font-size:18px; font-weight:bold;">Hi ${name}, 👋</td>
        </tr>
        <tr>
          <td style="padding:0 30px 15px; font-size:16px; color:#333;">
            You're in! 🎉 Your seat is confirmed for <strong>${eventName}</strong>.
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 15px; font-size:15px; color:#333;">
            📅 Don’t forget to add this session to your calendar and be on time!
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 15px; font-size:15px; color:#333;">
            We’ve also included a few helpful resources to support your learning journey.
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 20px; font-size:15px; color:#333;">
            👉 For more events, updates, guides, and daily insights — join our WhatsApp community:
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 30px 30px;">
            <a href="${whatsappGroupLink}" style="display:inline-block; background:#25D366; color:#fff; padding:10px 20px; border-radius:5px; text-decoration:none;">Join WhatsApp Group</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 30px; font-size:14px; color:#777;">
            Looking forward to seeing you there!<br/><br/>
            Best,<br/><strong>Team Product Space</strong>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};

module.exports = Approved;
