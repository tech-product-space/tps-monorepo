const { Op } = require("sequelize");
const db = require("../../models");
const {
  STATUS,
  OPEN_STATUSES,
  PRIORITY,
  SENDER_TYPE,
  MESSAGE_TYPE,
} = require("../../constants/support");
const {
  nextTicketNumber,
  resolveCohort,
  computePriority,
} = require("../../service/support/supportTicketService");
const uploadSupportFile = require("../../service/support/uploadSupportFile");
const {
  sendTicketCreated,
  sendTicketClosed,
} = require("../../service/support/supportEmails");
const {
  scheduleSupportReplyNotification,
} = require("../../jobs/supportNotifyScheduler");
const { getPaginationParams, getMeta } = require("../../utils/pagination");

const sequelize = db.sequelize;
const {
  SupportTicket,
  SupportTicketMessage,
  SupportTicketAttachment,
  users,
  company,
  CohortMember,
} = db;

const VALID_STATUSES = Object.values(STATUS);
const VALID_PRIORITIES = Object.values(PRIORITY);

// Inbox ordering: most urgent first, then most recent activity.
const priorityOrder = sequelize.literal(
  `CASE "SupportTicket"."priority" WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END`
);

const requesterInclude = {
  model: users,
  as: "requester",
  attributes: ["id", "name", "email", "phone", "profile_picture"],
};
const cohortInclude = {
  model: CohortMember,
  as: "cohortMember",
  attributes: ["id", "course", "cohort", "status", "role"],
};
// All attachments for the ticket. Those with message_id === null belong to the
// original query; the rest are tied to a chat message.
const attachmentsInclude = {
  model: SupportTicketAttachment,
  as: "attachments",
};

function messagesInclude(includeInternal) {
  // Users only see actual messages and phone-request prompts — status/priority
  // change logs are staff-facing activity, not chat content.
  const where = includeInternal
    ? undefined
    : {
        is_internal: false,
        type: { [Op.in]: [MESSAGE_TYPE.MESSAGE, MESSAGE_TYPE.PHONE_REQUEST] },
      };
  return {
    model: SupportTicketMessage,
    as: "messages",
    ...(where ? { where, required: false } : {}),
    separate: true,
    order: [["createdAt", "ASC"]],
    include: [
      { model: users, as: "userAuthor", attributes: ["id", "name", "profile_picture"] },
      { model: company, as: "staffAuthor", attributes: ["id", "name"] },
      { model: SupportTicketAttachment, as: "attachments" },
    ],
  };
}

// Loads one ticket fully (messages + attachments). For users we hide internal
// staff notes.
async function loadTicket(id, { includeInternal }) {
  return SupportTicket.findByPk(id, {
    include: [
      requesterInclude,
      cohortInclude,
      attachmentsInclude,
      messagesInclude(includeInternal),
    ],
  });
}

// Uploads + persists attachment rows tied to a message.
async function persistAttachments(files, opts, transaction) {
  if (!files || !files.length) return;
  for (const file of files) {
    const up = await uploadSupportFile(file);
    await SupportTicketAttachment.create(
      {
        ticket_id: opts.ticketId,
        message_id: opts.messageId || null,
        file_url: up.url,
        file_name: up.name,
        file_type: up.type,
        file_size: up.size,
        uploaded_by_type: opts.uploadedByType,
        uploaded_by_id: opts.uploadedById,
      },
      { transaction }
    );
  }
}

/* ----------------------------- USER ENDPOINTS ----------------------------- */

// POST /support/tickets  (requireUser, multipart "attachments")
exports.createTicket = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.appUser;
    const { subject, description, category, phone } = req.body;

    if (!subject || !subject.trim() || !description || !description.trim()) {
      await t.rollback();
      return res
        .status(400)
        .json({ message: "Subject and description are required." });
    }

    const { isCohortMember, cohortMemberId } = await resolveCohort(user.id, t);
    const priority = computePriority(isCohortMember);
    const ticketNumber = await nextTicketNumber(t);
    const now = new Date();

    const ticket = await SupportTicket.create(
      {
        ticket_number: ticketNumber,
        user_id: user.id,
        requester_name: user.name,
        requester_email: user.email,
        requester_phone:
          phone && phone.trim() ? phone.trim() : user.phone || null,
        subject: subject.trim(),
        category: category || null,
        description: description.trim(),
        status: STATUS.OPEN,
        priority,
        is_cohort_member: isCohortMember,
        cohort_member_id: cohortMemberId,
        last_message_at: now,
      },
      { transaction: t }
    );

    // The opening query lives on the ticket (subject + description); its
    // attachments hang off the ticket with no message_id so the UI can render
    // them under the original query.
    await persistAttachments(
      req.files,
      {
        ticketId: ticket.id,
        messageId: null,
        uploadedByType: SENDER_TYPE.USER,
        uploadedById: user.id,
      },
      t
    );

    await t.commit();

    sendTicketCreated(ticket);

    const full = await loadTicket(ticket.id, { includeInternal: false });
    return res.status(201).json({ data: full });
  } catch (error) {
    await t.rollback();
    console.error("createTicket error:", error);
    return res
      .status(500)
      .json({ message: "Failed to create ticket", error: error.message });
  }
};

// GET /support/tickets  (requireUser) — the caller's own tickets.
exports.listMyTickets = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 20, 100);

    const { rows, count } = await SupportTicket.findAndCountAll({
      where: { user_id: req.appUser.id },
      order: [["last_message_at", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.json({ data: rows, meta: getMeta(count, page, limit) });
  } catch (error) {
    console.error("listMyTickets error:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch tickets", error: error.message });
  }
};

// GET /support/tickets/:id  (requireUser)
exports.getMyTicket = async (req, res) => {
  try {
    const ticket = await loadTicket(req.params.id, { includeInternal: false });
    if (!ticket || ticket.user_id !== req.appUser.id) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Record that the owner has viewed the ticket so the debounced reply
    // notification can skip emailing if they've already seen the reply.
    SupportTicket.update(
      { last_user_seen_at: new Date() },
      { where: { id: ticket.id } }
    ).catch((e) =>
      console.error("Failed to stamp last_user_seen_at:", e?.message || e)
    );

    return res.json({ data: ticket });
  } catch (error) {
    console.error("getMyTicket error:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch ticket", error: error.message });
  }
};

// POST /support/tickets/:id/messages  (requireUser, multipart "attachments")
exports.addUserMessage = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.appUser;
    const ticket = await SupportTicket.findByPk(req.params.id, { transaction: t });

    if (!ticket || ticket.user_id !== user.id) {
      await t.rollback();
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.status === STATUS.CLOSED) {
      await t.rollback();
      return res.status(400).json({ message: "This query is closed." });
    }

    const body = (req.body.body || "").trim();
    const hasFiles = req.files && req.files.length;
    if (!body && !hasFiles) {
      await t.rollback();
      return res.status(400).json({ message: "Message cannot be empty." });
    }

    const message = await SupportTicketMessage.create(
      {
        ticket_id: ticket.id,
        sender_type: SENDER_TYPE.USER,
        sender_user_id: user.id,
        body: body || null,
        type: MESSAGE_TYPE.MESSAGE,
        is_internal: false,
      },
      { transaction: t }
    );

    await persistAttachments(
      req.files,
      {
        ticketId: ticket.id,
        messageId: message.id,
        uploadedByType: SENDER_TYPE.USER,
        uploadedById: user.id,
      },
      t
    );

    await ticket.update({ last_message_at: new Date() }, { transaction: t });

    await t.commit();

    const full = await loadTicket(ticket.id, { includeInternal: false });
    return res.status(201).json({ data: full });
  } catch (error) {
    await t.rollback();
    console.error("addUserMessage error:", error);
    return res
      .status(500)
      .json({ message: "Failed to send message", error: error.message });
  }
};

// POST /support/tickets/:id/phone  (requireUser)
// User responds to a staff phone-request: stores the number on this ticket AND
// on their profile (so future queries auto-fill it), and marks the outstanding
// request fulfilled. Works even on a closed ticket (it's not a chat reply).
exports.submitPhone = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.appUser;
    const ticket = await SupportTicket.findByPk(req.params.id, { transaction: t });

    if (!ticket || ticket.user_id !== user.id) {
      await t.rollback();
      return res.status(404).json({ message: "Ticket not found" });
    }

    const phone = String(req.body.phone || "").trim();
    // Value arrives prefixed with a country code (e.g. "+91 9876543210"); a
    // sane floor of 5 digits mirrors the client-side rule for non-IN numbers.
    if (!phone || (phone.replace(/\D/g, "")).length < 5) {
      await t.rollback();
      return res.status(400).json({ message: "Please enter a valid phone number." });
    }

    await ticket.update({ requester_phone: phone, last_message_at: new Date() }, { transaction: t });

    // Backfill every other existing ticket of this user that has no phone yet,
    // so they don't each need to be asked again.
    await SupportTicket.update(
      { requester_phone: phone },
      {
        where: {
          user_id: user.id,
          id: { [Op.ne]: ticket.id },
          [Op.or]: [{ requester_phone: null }, { requester_phone: "" }],
        },
        transaction: t,
      }
    );

    // Persist to the profile only when it's currently empty so we never clobber
    // a number the user set elsewhere.
    if (!user.phone) {
      await user.update({ phone }, { transaction: t });
    }

    // Flip the most recent phone-request prompt to fulfilled so the inline form
    // renders as "shared" instead of an open input.
    const pending = await SupportTicketMessage.findOne({
      where: { ticket_id: ticket.id, type: MESSAGE_TYPE.PHONE_REQUEST },
      order: [["createdAt", "DESC"]],
      transaction: t,
    });
    if (pending) {
      await pending.update(
        { metadata: { ...(pending.metadata || {}), fulfilled: true, phone } },
        { transaction: t }
      );
    }

    // Staff-facing log entry (hidden from the user-visible message filter).
    await SupportTicketMessage.create(
      {
        ticket_id: ticket.id,
        sender_type: SENDER_TYPE.SYSTEM,
        sender_user_id: user.id,
        body: "User shared their phone number.",
        type: MESSAGE_TYPE.SYSTEM,
        is_internal: false,
      },
      { transaction: t }
    );

    await t.commit();

    const full = await loadTicket(ticket.id, { includeInternal: false });
    return res.json({ data: full });
  } catch (error) {
    await t.rollback();
    console.error("submitPhone error:", error);
    return res
      .status(500)
      .json({ message: "Failed to save phone number", error: error.message });
  }
};

/* ----------------------------- STAFF ENDPOINTS ---------------------------- */

// GET /support/admin/tickets  (requireStaff)
exports.listTickets = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 20, 100);
    const { status, priority, cohort, search } = req.query;

    const where = {};

    if (status) {
      const list = String(status)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length) where.status = { [Op.in]: list };
    }
    if (priority) where.priority = priority;
    if (cohort === "true") where.is_cohort_member = true;

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { subject: { [Op.iLike]: q } },
        { ticket_number: { [Op.iLike]: q } },
        { requester_name: { [Op.iLike]: q } },
        { requester_email: { [Op.iLike]: q } },
      ];
    }

    const { rows, count } = await SupportTicket.findAndCountAll({
      where,
      include: [requesterInclude],
      order: [
        [priorityOrder, "ASC"],
        ["last_message_at", "DESC"],
      ],
      limit,
      offset,
      distinct: true,
    });

    return res.json({ data: rows, meta: getMeta(count, page, limit) });
  } catch (error) {
    console.error("listTickets error:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch tickets", error: error.message });
  }
};

// GET /support/admin/stats  (requireStaff)
exports.getStats = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [total, open, cohortOpen, closedToday, byStatusRaw, byPriorityRaw] =
      await Promise.all([
        SupportTicket.count(),
        SupportTicket.count({ where: { status: { [Op.in]: OPEN_STATUSES } } }),
        SupportTicket.count({
          where: { status: { [Op.in]: OPEN_STATUSES }, is_cohort_member: true },
        }),
        SupportTicket.count({
          where: { status: STATUS.CLOSED, closed_at: { [Op.gte]: startOfToday } },
        }),
        SupportTicket.findAll({
          attributes: ["status", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
          group: ["status"],
          raw: true,
        }),
        SupportTicket.findAll({
          attributes: ["priority", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
          group: ["priority"],
          raw: true,
        }),
      ]);

    const statusCounts = {};
    byStatusRaw.forEach((r) => (statusCounts[r.status] = Number(r.count)));
    const priorityCounts = {};
    byPriorityRaw.forEach((r) => (priorityCounts[r.priority] = Number(r.count)));

    return res.json({
      data: {
        total,
        open,
        cohortOpen,
        closedToday,
        statusCounts,
        priorityCounts,
      },
    });
  } catch (error) {
    console.error("getStats error:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch stats", error: error.message });
  }
};

// GET /support/admin/tickets/:id  (requireStaff) — includes internal notes.
exports.getTicket = async (req, res) => {
  try {
    const ticket = await loadTicket(req.params.id, { includeInternal: true });
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    return res.json({ data: ticket });
  } catch (error) {
    console.error("getTicket error:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch ticket", error: error.message });
  }
};

// POST /support/admin/tickets/:id/messages  (requireStaff, multipart "attachments")
exports.addStaffMessage = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const staff = req.staff;
    const ticket = await SupportTicket.findByPk(req.params.id, { transaction: t });
    if (!ticket) {
      await t.rollback();
      return res.status(404).json({ message: "Ticket not found" });
    }

    const body = (req.body.body || "").trim();
    const hasFiles = req.files && req.files.length;
    const isInternal =
      req.body.is_internal === true || req.body.is_internal === "true";

    if (!body && !hasFiles) {
      await t.rollback();
      return res.status(400).json({ message: "Message cannot be empty." });
    }

    const message = await SupportTicketMessage.create(
      {
        ticket_id: ticket.id,
        sender_type: SENDER_TYPE.STAFF,
        sender_staff_id: staff.id,
        body: body || null,
        type: MESSAGE_TYPE.MESSAGE,
        is_internal: isInternal,
      },
      { transaction: t }
    );

    await persistAttachments(
      req.files,
      {
        ticketId: ticket.id,
        messageId: message.id,
        uploadedByType: SENDER_TYPE.STAFF,
        uploadedById: staff.id,
      },
      t
    );

    // Public replies advance the ticket + notify the user. Internal notes are
    // silent and don't touch status/SLA fields.
    if (!isInternal) {
      const updates = { last_message_at: new Date() };
      if (!ticket.first_response_at) updates.first_response_at = new Date();
      if (ticket.status === STATUS.OPEN) {
        updates.status = STATUS.IN_PROGRESS;
      }
      await ticket.update(updates, { transaction: t });
    }

    await t.commit();

    if (!isInternal) {
      scheduleSupportReplyNotification(ticket.id).catch((e) =>
        console.error("Failed to schedule support reply notification:", e?.message || e)
      );
    }

    const full = await loadTicket(ticket.id, { includeInternal: true });
    return res.status(201).json({ data: full });
  } catch (error) {
    await t.rollback();
    console.error("addStaffMessage error:", error);
    return res
      .status(500)
      .json({ message: "Failed to send message", error: error.message });
  }
};

// PATCH /support/admin/tickets/:id  (requireStaff) — status / priority.
exports.updateTicket = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const staff = req.staff;
    const ticket = await SupportTicket.findByPk(req.params.id, { transaction: t });
    if (!ticket) {
      await t.rollback();
      return res.status(404).json({ message: "Ticket not found" });
    }

    const { status, priority } = req.body;
    const updates = {};
    const events = []; // system messages describing the change

    if (status !== undefined && status !== ticket.status) {
      if (!VALID_STATUSES.includes(status)) {
        await t.rollback();
        return res.status(400).json({ message: "Invalid status" });
      }
      updates.status = status;
      if (status === STATUS.CLOSED) updates.closed_at = new Date();
      else updates.closed_at = null;
      events.push({
        type: MESSAGE_TYPE.STATUS_CHANGE,
        body: `Status changed from ${ticket.status} to ${status}`,
        metadata: { from: ticket.status, to: status },
      });
    }

    if (priority !== undefined && priority !== ticket.priority) {
      if (!VALID_PRIORITIES.includes(priority)) {
        await t.rollback();
        return res.status(400).json({ message: "Invalid priority" });
      }
      updates.priority = priority;
      events.push({
        type: MESSAGE_TYPE.SYSTEM,
        body: `Priority changed from ${ticket.priority} to ${priority}`,
        metadata: { from: ticket.priority, to: priority },
      });
    }

    if (!Object.keys(updates).length) {
      await t.rollback();
      const full = await loadTicket(ticket.id, { includeInternal: true });
      return res.json({ data: full });
    }

    await ticket.update(updates, { transaction: t });

    for (const ev of events) {
      await SupportTicketMessage.create(
        {
          ticket_id: ticket.id,
          sender_type: SENDER_TYPE.SYSTEM,
          sender_staff_id: staff.id,
          body: ev.body,
          type: ev.type,
          is_internal: false,
          metadata: ev.metadata,
        },
        { transaction: t }
      );
    }

    await t.commit();

    if (updates.status === STATUS.CLOSED) sendTicketClosed(ticket);

    const full = await loadTicket(ticket.id, { includeInternal: true });
    return res.json({ data: full });
  } catch (error) {
    await t.rollback();
    console.error("updateTicket error:", error);
    return res
      .status(500)
      .json({ message: "Failed to update ticket", error: error.message });
  }
};

// POST /support/admin/tickets/:id/request-phone  (requireStaff)
// Posts a user-visible prompt asking for a phone number. No-ops cleanly when the
// ticket already has one, and won't stack duplicate prompts if one is still open.
// Does NOT change ticket status, so it can follow a "Close session".
exports.requestPhone = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const staff = req.staff;
    const ticket = await SupportTicket.findByPk(req.params.id, { transaction: t });
    if (!ticket) {
      await t.rollback();
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.requester_phone) {
      await t.rollback();
      return res
        .status(400)
        .json({ message: "This ticket already has a phone number." });
    }

    // If a prompt is already awaiting a response, return as-is (idempotent).
    const existing = await SupportTicketMessage.findOne({
      where: { ticket_id: ticket.id, type: MESSAGE_TYPE.PHONE_REQUEST },
      order: [["createdAt", "DESC"]],
      transaction: t,
    });
    if (existing && !(existing.metadata && existing.metadata.fulfilled)) {
      await t.rollback();
      const full = await loadTicket(ticket.id, { includeInternal: true });
      return res.json({ data: full });
    }

    await SupportTicketMessage.create(
      {
        ticket_id: ticket.id,
        sender_type: SENDER_TYPE.STAFF,
        sender_staff_id: staff.id,
        body: "Please share your phone number so our team can reach you.",
        type: MESSAGE_TYPE.PHONE_REQUEST,
        is_internal: false,
        metadata: { fulfilled: false },
      },
      { transaction: t }
    );

    await ticket.update({ last_message_at: new Date() }, { transaction: t });

    await t.commit();

    scheduleSupportReplyNotification(ticket.id).catch((e) =>
      console.error("Failed to schedule support reply notification:", e?.message || e)
    );

    const full = await loadTicket(ticket.id, { includeInternal: true });
    return res.status(201).json({ data: full });
  } catch (error) {
    await t.rollback();
    console.error("requestPhone error:", error);
    return res
      .status(500)
      .json({ message: "Failed to request phone number", error: error.message });
  }
};
