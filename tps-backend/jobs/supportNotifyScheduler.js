const agenda = require("../config/agenda");
const db = require("../models");
const { STATUS, SENDER_TYPE, MESSAGE_TYPE } = require("../constants/support");
const { sendNewReply } = require("../service/support/supportEmails");

const { SupportTicket, SupportTicketMessage } = db;

/* ------------------------------------------
   JOB CONFIG
------------------------------------------ */

const JOB_NAME = "support:notify-user-reply";
const NOTIFY_DELAY = "in 5 minutes";

/* ------------------------------------------
   JOB DEFINITION
------------------------------------------ */

// Runs a few minutes after the latest staff reply on a ticket. Skips the
// email if the ticket is closed, the user has already replied since, or the
// user has already seen the reply in-app (last_user_seen_at is fresh).
agenda.define(JOB_NAME, async (job) => {
  const { ticketId } = job.attrs.data;

  const ticket = await SupportTicket.findByPk(ticketId);
  if (!ticket || ticket.status === STATUS.CLOSED) return;

  if (
    ticket.last_user_seen_at &&
    ticket.last_message_at &&
    ticket.last_user_seen_at >= ticket.last_message_at
  ) {
    return;
  }

  const lastMessage = await SupportTicketMessage.findOne({
    where: { ticket_id: ticketId, type: MESSAGE_TYPE.MESSAGE, is_internal: false },
    order: [["createdAt", "DESC"]],
  });
  if (lastMessage && lastMessage.sender_type === SENDER_TYPE.USER) return;

  sendNewReply(ticket);
  await ticket.update({ last_user_notified_at: new Date() });
});

/* ------------------------------------------
   SCHEDULER FUNCTIONS
------------------------------------------ */

// Debounces the "new reply" email: a burst of staff messages on the same
// ticket collapses into a single scheduled job (the latest call wins).
async function scheduleSupportReplyNotification(ticketId) {
  await agenda.cancel({ name: JOB_NAME, "data.ticketId": ticketId });
  await agenda.schedule(NOTIFY_DELAY, JOB_NAME, { ticketId });
}

module.exports = {
  scheduleSupportReplyNotification,
};
