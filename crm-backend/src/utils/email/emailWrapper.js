/**
 * Branded HTML wrapper for outgoing emails.
 *
 * Admins write only the *content* in the template editor; this shell adds the
 * logo header + styled body + footer at send time so every email is consistent.
 *
 * Email-client-safe by design: table-based layout, all styles inline, 600px
 * width. Do NOT switch to fl/grid/<style> — Gmail/Outlook strip them.
 *
 * ─── EDIT BRANDING HERE ─────────────────────────────────────────────────────
 */
const BRAND = {
  name: "Product Space",
  // Wide logo — WHITE wordmark + gradient mark on transparent. Needs the dark
  // header band below to be visible. Space in the filename is encoded.
  logoUrl: "https://assets.theproductspace.in/blogs/1783924264774-Logo%20long.png",
  logoWidth: 210, // px
  primary: "#0b5cd6", // links / accents (brand blue, matches the logo)
  // Header band the white logo sits on. Solid black makes the white wordmark
  // and the teal→blue mark pop. `headerBg` is also the Outlook fallback.
  headerBg: "#000000",
  headerGradientFrom: "#000000",
  headerGradientTo: "#000000",
  website: "https://www.theproductspace.in",
  supportUrl: "https://theproductspace.in/support",
  address: "Product Space", 
  tagline: "",
  socials: {
    linkedin: "https://www.linkedin.com/company/theproductspace/",
    instagram: "https://www.instagram.com/productspaceofficial?igsh=Y2plZmJ3Mm5sNGRp",
  },
};
/* ─────────────────────────────────────────────────────────────────────────── */

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Wrap rendered content HTML in the branded shell.
 *
 * @param {object} opts
 * @param {string} opts.bodyHtml     - The inner content (already token-rendered)
 * @param {string} [opts.preheader]  - Hidden preview text shown in the inbox list
 * @returns {string} full HTML document
 */
function wrapEmail({ bodyHtml = "", preheader = "" } = {}) {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light only" />
  <title>${BRAND.name}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f5f7;opacity:0;">
    ${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <!-- Card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <!-- Header / logo on brand gradient band (white logo needs a dark bg) -->
          <tr>
            <td align="center" bgcolor="${BRAND.headerBg}" style="padding:34px 32px;background-color:${BRAND.headerBg};background-image:linear-gradient(90deg, ${BRAND.headerGradientFrom} 0%, ${BRAND.headerGradientTo} 100%);">
              <a href="${BRAND.website}" target="_blank" style="text-decoration:none;">
                <img src="${BRAND.logoUrl}" width="${BRAND.logoWidth}" alt="${escapeHtml(BRAND.name)}" style="display:block;border:0;outline:none;text-decoration:none;width:${BRAND.logoWidth}px;max-width:100%;height:auto;" />
              </a>
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td style="padding:32px 32px 8px 32px;font-family:${FONT};font-size:16px;line-height:1.6;color:#1e293b;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 28px 32px;">
              <div style="border-top:1px solid #eef0f3;padding-top:20px;font-family:${FONT};">
                <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#334155;">${escapeHtml(BRAND.name)}</p>
                <p style="margin:0 0 12px 0;font-size:12px;color:#94a3b8;">${escapeHtml(BRAND.tagline)}</p>
                <p style="margin:0 0 12px 0;font-size:12px;">
                  <a href="${BRAND.socials.linkedin}" target="_blank" style="color:${BRAND.primary};text-decoration:none;">LinkedIn</a>
                  &nbsp;&middot;&nbsp;
                  <a href="${BRAND.socials.instagram}" target="_blank" style="color:${BRAND.primary};text-decoration:none;">Instagram</a>
                  &nbsp;&middot;&nbsp;
                  <a href="${BRAND.website}" target="_blank" style="color:${BRAND.primary};text-decoration:none;">Website</a>
                </p>
                <p style="margin:0 0 4px 0;font-size:12px;color:#94a3b8;">
                  Have a question? Head over to our <a href="${BRAND.supportUrl}" target="_blank" style="color:${BRAND.primary};text-decoration:none;font-weight:600;">support page</a>
                </p>
                <p style="margin:0;font-size:11px;color:#cbd5e1;">
                  ${escapeHtml(BRAND.address)} &middot; &copy; ${year} ${escapeHtml(BRAND.name)}. All rights reserved.
                </p>
              </div>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Minimal HTML-escape for text placed into attributes / plain text nodes. */
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { wrapEmail, BRAND };
