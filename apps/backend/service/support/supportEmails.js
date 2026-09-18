const sendEmail = require("../mail/sendEmail");

const FROM = "noreply@theproductspace.in";
const FROM_NAME = "The Product Space Support";
const BRAND = "#00A972";

function ticketUrl(ticket) {
  const base = (process.env.FRONTEND_URL || "https://www.theproductspace.co.in").replace(/\/$/, "");
  return `${base}/support/${ticket.id}`;
}

function layout({ heading, lines, ticket, ctaLabel }) {
  const url = ticketUrl(ticket);
  const body = lines.map((l) => `<p style="margin:0 0 12px;color:#333;font-size:15px;line-height:1.6;">${l}</p>`).join("");
  return `
  <div style="background:#f4f4f5;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #ececec;">
      <div style="background:#0f0f0f;padding:20px 28px;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;">The Product Space</span>
        <span style="color:${BRAND};font-size:18px;font-weight:700;"> Support</span>
      </div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 16px;font-size:20px;color:#0f0f0f;">${heading}</h2>
        ${body}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
          <tr>
            <td style="border-radius:8px;background:${BRAND};">
              <a href="${url}" target="_blank"
                 style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">
                ${ctaLabel}
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;color:#999;font-size:12px;">
          Reference: <strong>${ticket.ticket_number}</strong>
        </p>
      </div>
    </div>
  </div>`;
}

function send(to, subject, html) {
  // Fire-and-forget — never block the API response on email delivery.
  if (!to) return;
  sendEmail({ to, subject, html, from: FROM, fromName: FROM_NAME }).catch((e) =>
    console.error("Support email failed:", e?.message || e)
  );
}

function sendTicketCreated(ticket) {
  const html = layout({
    heading: "We've received your query",
    lines: [
      `Hi ${ticket.requester_name || "there"},`,
      `Thanks for reaching out. Your query <strong>"${ticket.subject}"</strong> has been logged and our team will get back to you shortly.`,
      `You can track the conversation and reply any time from your support page.`,
    ],
    ticket,
    ctaLabel: "View your query",
  });
  send(ticket.requester_email, `We've received your query (${ticket.ticket_number})`, html);
}

function sendNewReply(ticket) {
  const html = layout({
    heading: "Our team has replied",
    lines: [
      `Hi ${ticket.requester_name || "there"},`,
      `There's a new response on your query <strong>"${ticket.subject}"</strong>.`,
      `Click below to read it and continue the conversation.`,
    ],
    ticket,
    ctaLabel: "Open the conversation",
  });
  send(ticket.requester_email, `New response on your query (${ticket.ticket_number})`, html);
}

function sendTicketClosed(ticket) {
  const html = layout({
    heading: "Your query has been closed",
    lines: [
      `Hi ${ticket.requester_name || "there"},`,
      `Your query <strong>"${ticket.subject}"</strong> has been marked as closed.`,
    ],
    ticket,
    ctaLabel: "View your query",
  });
  send(ticket.requester_email, `Your query has been closed (${ticket.ticket_number})`, html);
}

module.exports = {
  sendTicketCreated,
  sendNewReply,
  sendTicketClosed,
};
