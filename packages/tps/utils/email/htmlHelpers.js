const replacePlaceholders = (body, replacements) => {
  const withValues = body.replace(/{{(.*?)}}/g, (_, key) => {
    return replacements[key.trim()] ?? "";
  });

  // Convert newlines to <br> for HTML emails
  return withValues.replace(/\n/g, "<br>");
};

const cleanHtml = (html) => {
  return html
    .replace(/white-space:\s*pre-wrap;?/g, "")
    .replace(/white-space:\s*pre;?/g, "")
    .replace(/<p\b[^>]*>/gi, "<div>") // replace opening <p ...> with <div>
    .replace(/<\/p>/gi, "</div>") // replace closing </p> with </div>
    .replace(/font-family:[^;"']+;?/gi, "font-family: Arial, Helvetica, sans-serif;") // remove broken font families
};

const wrapEmailTemplate = (content) => {
  return `
    <!--[if mso]>
  <style>
  * { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->

  <style>
    /* Below the 600px container width the card is the whole screen,
       so drop its side gutters and let content run edge to edge. */
    @media only screen and (max-width: 600px) {
      .tps-pad { padding-left: 0 !important; padding-right: 0 !important; }
    }
  </style>

  <div style="background-color:#f3f4f6;width:100%;font-family:Arial,Helvetica,sans-serif;">
    <div class="tps-pad" style="max-width:600px;margin:0 auto;background-color:#ffffff;padding:24px;font-size:14px;color:#111827;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">
      ${content}
    </div>
  </div>
  `;
};

const wrapEmailTemplateWithUnsubscribe = (content , unsubscribeUrl) => {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Email</title>

    <!--[if mso]>
      <style>
        * { font-family: Arial, sans-serif !important; }
      </style>
    <![endif]-->

    <style>
      /* Below the 600px container width the card is the whole screen,
         so drop its side gutters and let content run edge to edge. */
      @media only screen and (max-width: 600px) {
        .tps-pad { padding-left: 0 !important; padding-right: 0 !important; }
      }
    </style>
  </head>

  <body style="margin:0;padding:0;background-color:#f3f4f6;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
      <tr>
        <td align="center">

          <!-- Main Container -->
          <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;">

            <!-- Content -->
            <tr>
              <td class="tps-pad" style="padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:14px;line-height:1.6;">
                ${content}
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td class="tps-pad" style="padding:0 24px;">
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td class="tps-pad" style="padding:16px 24px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;line-height:1.5;">
                
                <p style="margin:0 0 8px;">
                  You’re receiving this email because you signed up for our service.
                </p>

                <p style="margin:0;">
                  <a href="${unsubscribeUrl}" 
                     style="color:#2563eb;text-decoration:none;">
                    Unsubscribe
                  </a>
                </p>

              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};


module.exports = { replacePlaceholders, cleanHtml, wrapEmailTemplate , wrapEmailTemplateWithUnsubscribe };