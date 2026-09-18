import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";

const { Contact, ContactList, AdminUser } = db;

/**
 * CREATE LIST
 *
 * A list can exist empty — the upload is a second step, and the dialog that
 * creates a list is also the one that uploads to it, so a failed parse must not
 * leave the admin without the list they just named.
 */
export const createContactList = asyncWrapper(async (req, res) => {
  const { name, description } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: "name is required" });
  }

  const list = await ContactList.create({
    name: String(name).trim(),
    description: description ? String(description).trim() : null,
    createdBy: req.admin?.id || null,
  });

  return res.status(201).json({
    message: "Contact list created",
    data: list,
  });
});

/**
 * LIST LISTS
 *
 * With a contact count each — a list's size is the only thing anyone wants to
 * know from the index, and fetching it per row in the panel would be N+1 over
 * a table that grows by tens of thousands.
 */
export const listContactLists = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { search } = req.query;

  const where = {};

  if (search) {
    where.name = { [Op.iLike]: `%${search}%` };
  }

  const { rows, count } = await ContactList.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: AdminUser,
        as: "createdAdmin",
        attributes: ["id", "name", "email"],
      },
    ],
  });

  // One grouped count for the page rather than one query per list.
  const counts = rows.length
    ? await Contact.findAll({
        where: { contactListId: { [Op.in]: rows.map((r) => r.id) } },
        attributes: [
          "contactListId",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        group: ["contactListId"],
        raw: true,
      })
    : [];

  const countByList = Object.fromEntries(
    counts.map((c) => [c.contactListId, Number(c.count)]),
  );

  return res.json({
    data: rows.map((row) => ({
      ...row.toJSON(),
      contactCount: countByList[row.id] || 0,
    })),
    meta: getMeta(count, page, limit),
  });
});

/**
 * GET ONE LIST
 */
export const getContactList = asyncWrapper(async (req, res) => {
  const list = await ContactList.findByPk(req.params.id, {
    include: [
      {
        model: AdminUser,
        as: "createdAdmin",
        attributes: ["id", "name", "email"],
      },
    ],
  });

  if (!list) {
    return res.status(404).json({ message: "Contact list not found" });
  }

  const contactCount = await Contact.count({
    where: { contactListId: list.id },
  });

  return res.json({ data: { ...list.toJSON(), contactCount } });
});

/**
 * RENAME / EDIT LIST
 */
export const updateContactList = asyncWrapper(async (req, res) => {
  const list = await ContactList.findByPk(req.params.id);

  if (!list) {
    return res.status(404).json({ message: "Contact list not found" });
  }

  const updates = {};

  if (req.body.name !== undefined) {
    if (!String(req.body.name).trim()) {
      return res.status(400).json({ message: "name cannot be empty" });
    }
    updates.name = String(req.body.name).trim();
  }

  if (req.body.description !== undefined) {
    updates.description = req.body.description
      ? String(req.body.description).trim()
      : null;
  }

  await list.update(updates);

  return res.json({ message: "Contact list updated", data: list });
});

/**
 * DELETE LIST
 *
 * The contacts cascade with it. A campaign that already **sent** to this list is
 * unaffected — its recipients were materialised into `campaign_recipients` at
 * send time — but a draft or scheduled campaign targeting it would silently
 * resolve to fewer people, so that case is refused rather than allowed through.
 */
export const deleteContactList = asyncWrapper(async (req, res) => {
  const list = await ContactList.findByPk(req.params.id);

  if (!list) {
    return res.status(404).json({ message: "Contact list not found" });
  }

  // `recipientFilters` is JSONB, so this is a containment search rather than a
  // join. Cheap: campaigns are counted in the hundreds, not the millions.
  const [blocking] = await db.sequelize.query(
    `
    SELECT id, name
    FROM campaigns
    WHERE status IN ('draft', 'scheduled', 'processing')
      AND "recipientFilters"::text LIKE :needle
    LIMIT 5;
    `,
    { replacements: { needle: `%${list.id}%` } },
  );

  if (blocking.length) {
    return res.status(409).json({
      message: `This list is used by ${blocking.length === 1 ? "a campaign" : "campaigns"} that has not been sent yet (${blocking
        .map((c) => c.name)
        .join(", ")}). Remove it from the audience first.`,
    });
  }

  // The automatic label lookup cannot run once the row is gone.
  req.activity?.set({ entityLabel: list.name });

  await list.destroy();

  return res.json({ message: "Contact list deleted" });
});

/**
 * LIST CONTACTS IN A LIST
 */
export const listContacts = asyncWrapper(async (req, res) => {
  const list = await ContactList.findByPk(req.params.id);

  if (!list) {
    return res.status(404).json({ message: "Contact list not found" });
  }

  const { page, limit, offset } = getPaginationParams(req.query);
  const { search } = req.query;

  const where = { contactListId: list.id };

  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
      { phone: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Contact.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  return res.json({
    data: rows,
    meta: getMeta(count, page, limit),
  });
});

/**
 * DELETE ONE CONTACT
 *
 * Removes them from this list only. It does **not** stop them being emailed —
 * they may sit in three other audiences — which is what unsubscribing is for.
 */
export const deleteContact = asyncWrapper(async (req, res) => {
  const contact = await Contact.findOne({
    where: { id: req.params.contactId, contactListId: req.params.id },
  });

  if (!contact) {
    return res.status(404).json({ message: "Contact not found" });
  }

  // The entity is the *list*, so the label is filled in automatically from it.
  // The address goes in metadata — putting it in `entityLabel` would make the
  // row read as though a contact list called "bob@example.com" was edited.
  req.activity?.set({ metadata: { removed: contact.email } });

  await contact.destroy();

  return res.json({ message: "Contact removed from the list" });
});
