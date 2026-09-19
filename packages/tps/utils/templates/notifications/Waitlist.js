const Waitlist = ({ name, eventName, noOfPeople, whatsappGroupLink, referralLink }) => {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Waitlist for ${eventName}</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f9f9f9;">
      <table align="center" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#fff; border-radius:8px; margin:20px auto; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
        <tr>
          <td align="center" style="padding:20px 0;">
            <img src="https://tps-storage.s3.ap-south-1.amazonaws.com/blogs/product-space.png" width="150" />
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 10px; font-size:18px; font-weight:bold;">Hi ${name}, 👋</td>
        </tr>
        <tr>
          <td style="padding:0 30px 20px; font-size:16px; color:#555;">
            Thanks for signing up for our upcoming workshop <strong>${eventName}!</strong>
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 15px; font-size:15px; color:#333;">
            Due to limited availability, your request has been added to the waitlist. The first ${noOfPeople} people to register will receive confirmed seats. We’ll notify you via email if your spot is confirmed.
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 20px; font-size:15px; color:#333;">
            To improve your chances, share your unique referral link with a friend. If at least one of them registers, we’ll prioritize your entry.
          </td>
        </tr>
        <tr>
          <td align="left" style="padding:20px 30px; font-family:Arial, sans-serif; font-size:16px; line-height:1.5; color:#333;">
            👉 Use this unique referral link to invite your network and unlock bonus resource guides: 
            <a href="${referralLink}" style="color:#007bff; text-decoration:underline;">${referralLink}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 30px 10px; font-size:15px; color:#333;">
            👉 Join our WhatsApp Community for all updates:
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 30px 30px;">
            <a href="${whatsappGroupLink}" style="display:inline-block; background:#25D366; color:#fff; padding:10px 20px; border-radius:5px; text-decoration:none;">Join WhatsApp Group</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 30px 30px; font-size:14px; color:#777;">
            Thanks again for your interest. We’re excited to have you in our community!<br/><br/>
            Best,<br/>Team Product Space
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};

module.exports = Waitlist;
