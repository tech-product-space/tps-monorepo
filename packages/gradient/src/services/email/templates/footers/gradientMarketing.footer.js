/**
 * Footer for marketing campaigns. **Every campaign email carries it.**
 *
 * Not a per-campaign or per-sender setting, deliberately: an opt-out that some
 * sends include and others skip is not an opt-out. If you find yourself adding
 * a flag to turn this off, the answer is no.
 *
 * One line, one word. Note that suppression is scoped to campaigns only —
 * event reminders, certificates and password resets keep sending — so the
 * scope is spelled out on the /unsubscribe page instead of in the link text.
 * Keep it there.
 *
 * @param {object} props
 * @param {string} props.unsubscribeUrl one-click, per-recipient, no expiry
 */
export const gradientMarketingFooter = ({ unsubscribeUrl } = {}) => {
  // Defensive: a footer without a working link is worse than an obviously
  // missing one, because it looks like an opt-out and does nothing.
  if (!unsubscribeUrl) return "";

  return `
  <div style="max-width:600px;margin:0 auto;padding:20px 24px;text-align:center;font-family:Arial,Helvetica,sans-serif;color:#9ca3af;font-size:12px;line-height:1.6;">
    Gradient Learnings &middot;
    <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
  </div>
  `;
};
