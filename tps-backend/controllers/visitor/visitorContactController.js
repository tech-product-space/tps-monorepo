const { Visitor, VisitorContact } = require("../../models");
const {
  claimAnonymousActivityInBackground,
} = require("../../service/visitorActivity/claim");

//POST /visitor/contact/create
exports.createContact = async (req, res) => {
  const { visitorId, name, email, phone, source } = req.body;

  if (!visitorId) {
    return res.status(400).json({ error: "visitorId is required" });
  }

  if (!source) {
    return res.status(400).json({ error: "source is required" });
  }

  const visitor = await Visitor.findByPk(visitorId);
  if (!visitor) {
    return res.status(404).json({ error: "Visitor not found" });
  }

  await VisitorContact.create({
    visitorId,
    name,
    email,
    phone,
    source,
  });

  // This browser now belongs to someone. Everything it did before this moment
  // was recorded with no phone and held back from the CRM; claiming it stamps
  // the number on and releases the lot. That is what makes an agent's view of
  // this person start weeks before the form instead of at it.
  //
  // Not awaited: a form submission must never fail, or slow down, because of
  // history bookkeeping. If it fails the rows keep phone IS NULL and the next
  // contact from this browser claims them instead.
  claimAnonymousActivityInBackground(visitorId, { name, email, phone });

  return res.status(201).json({
    message: "Contact saved successfully",
  });
};

//GET /visitor/contacts/123
exports.viewContacts = async (req, res) => {
  const { visitorId } = req.params;

  if (!visitorId) {
    return res.status(400).json({ error: "visitorId is required" });
  }

  const visitor = await Visitor.findByPk(visitorId);
  if (!visitor) {
    return res.status(404).json({ error: "Visitor not found" });
  }

  const contacts = await visitor.getContacts({
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    message: "Contacts fetched successfully",
    data: contacts,
  });
};
