export const gradientLayout = ({ header, body, footer }) => {
  return `
      <!--[if mso]>
  <style>
  * { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->

  <div style="background-color:#f3f4f6;padding:40px 0;width:100%;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background-color:#ffffff;padding:24px;font-size:14px;border-radius:8px;color:#111827;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">
      ${body}
    </div>

    ${footer}
  </div>
  `;
};

/*
 * `header` is accepted and deliberately not rendered.
 *
 * Neither it nor `footer` was rendered until the marketing footer needed to
 * exist — every caller has been passing `HEADERS.GRADIENT` and having it
 * silently discarded, which is why `gradientFooter` could sit commented out
 * without anyone noticing.
 *
 * Rendering the footer is safe: `gradientFooter` returns an HTML comment, so
 * existing transactional email is byte-for-byte unchanged and only the new
 * marketing footer produces visible output.
 *
 * Rendering the header is not. It would add a "TheGradient" title block to
 * every password reset, admin invite, certificate and resource delivery
 * currently in production, which is a design decision nobody has made. Left
 * off until someone does — at which point delete this comment and interpolate
 * `${header}` above the body.
 */
