const Hackathon = ({ name, eventName, whatsappGroupLink, date }) => {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ${eventName}</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f9f9f9; margin:0; padding:0;">
      <table align="center" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; width:100%; background:#ffffff; border-radius:8px; margin:20px auto; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
        <tr>
          <td align="center" style="padding:20px 20px 10px;">
            <img src="https://tps-storage.s3.ap-south-1.amazonaws.com/blogs/product-space.png" width="150" alt="Product Space" style="display:block; border:0; outline:none; text-decoration:none;" />
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px 10px; font-size:18px; font-weight:bold; color:#111111;">
            Hello, ${name} 👋
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px 12px; font-size:16px; color:#333333;">
            Welcome to <strong>${eventName}</strong>
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px 12px; font-size:15px; color:#333333; line-height:1.6;">
            In just <strong>7 days</strong>, you'll go from idea to an <strong>AI-powered prototype</strong> and showcase real proof-of-work in your product portfolio.
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px 12px; font-size:15px; color:#333333; line-height:1.6;">
            No coding required — we’ll guide you with the tools, structure, and community you need to build end-to-end.
          </td>
        </tr>

        <tr>
          <td style="text-align:center; padding:8px 30px 6px;">
            <a href="${whatsappGroupLink}" style="display:inline-block; background:#25D366; color:#ffffff; padding:12px 20px; border-radius:6px; text-decoration:none; font-weight:600;">
              👉 Join WhatsApp Group for more details
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:6px 30px 12px; font-size:14px; color:#666666; text-align:center;">
            You'll receive all updates and logistics in the WhatsApp group.
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px 12px; font-size:15px; color:#333333; line-height:1.6;">
            We'll kickoff the competition on <strong>${date}</strong>.
          </td>
        </tr>

        <tr>
          <td style="padding:12px 30px 8px; font-size:16px; font-weight:bold; color:#111111;">
            ✨ What makes this hackathon unmissable?
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px 18px;">
            <ul style="margin:0; padding:0 0 0 18px; color:#333333; font-size:15px; line-height:1.7;">
              <li style="margin:6px 0;">✅ Join 2000+ participants from IITs, IIMs, BITS & 5+ countries</li>
              <li style="margin:6px 0;">✅ Pick your path: Solve curated problem statements or vibe-code your own idea</li>
              <li style="margin:6px 0;">✅ Learn & apply 10+ AI tools used by top PMs</li>
              <li style="margin:6px 0;">✅ Build working prototypes, not just slides</li>
              <li style="margin:6px 0;">✅ Compete solo or in teams of 2</li>
              <li style="margin:6px 0;">✅ Win cash prizes, course vouchers & certificates</li>
            </ul>
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px 16px; font-size:15px; color:#333333; line-height:1.6;">
            If you’ve been meaning to build your AI product portfolio, this is your chance to do it with momentum, visibility, and a global PM community’s support. 🙌
          </td>
        </tr>

        <tr>
          <td style="padding:0 30px 24px; font-size:14px; color:#777777;">
            Thanks!<br/>
            <strong>Team Product Space</strong>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};

module.exports = Hackathon;
