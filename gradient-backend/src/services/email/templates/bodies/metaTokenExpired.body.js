/**
 * Sent once when a Facebook page token stops working.
 *
 * This email is the whole reason the alert exists. A page token that expires on
 * a Friday evening costs a weekend of lead ads with nothing in the panel to
 * show for it, and the failure is invisible unless somebody happens to open the
 * monitoring tab. Every other symptom of this feature breaking is loud; this
 * one is silent, so it gets a mail.
 *
 * Graph's own error message is passed through verbatim — "(#190) This method
 * must be called with a Page Access Token" tells the reader precisely what to
 * fix, and any paraphrase would be worse.
 */
export const metaTokenExpiredBody = ({
  accountName,
  pageId,
  errorMessage,
  settingsUrl,
}) => {
  return `
    <h2 style="margin-top:0;">Facebook lead ingestion has stopped</h2>

    <p>
      The access token for <strong>${accountName}</strong> (Page ID
      ${pageId}) is no longer valid, so Gradient has stopped importing leads
      from its lead ad forms.
    </p>

    <p style="color:#6b7280;font-size:14px;">
      <strong>Leads are not being lost at Facebook's end</strong> — they are
      still collected there. Once a working token is saved, run a backfill on
      each form to import everything from the gap.
    </p>

    <div
      style="
        background:#fef2f2;
        border-left:4px solid #dc2626;
        padding:12px 16px;
        margin:24px 0;
        border-radius:6px;
      "
    >
      <p style="margin:0;color:#991b1b;font-size:14px;font-family:monospace;">
        ${errorMessage}
      </p>
    </div>

    <p>
      Generate a new <strong>System User page token</strong> and paste it into
      the account — those do not expire, unlike a token taken from the Graph API
      Explorer.
    </p>

    <div style="text-align:center;margin:30px 0;">
      <a
        href="${settingsUrl}"
        style="
          background:linear-gradient(180deg,#2EA0FF,#0B6BD6);
          color:#ffffff;
          text-decoration:none;
          padding:14px 28px;
          border-radius:12px;
          display:inline-block;
          font-weight:600;
          font-size:15px;
        "
      >
        Open Facebook settings
      </a>
    </div>

    <p style="color:#6b7280;font-size:14px;">
      You will not get another alert for this account until the token is
      replaced, so this message is not going to repeat every five minutes.
    </p>
  `;
};

export default metaTokenExpiredBody;
