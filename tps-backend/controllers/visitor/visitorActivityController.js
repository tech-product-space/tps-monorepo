const { NotificationSSE } = require("../../config/SSE");
const {
  sendVisitToCRMInBackground,
} = require("../../service/crm/websiteVisit");
const {
  bufferPageViewInBackground,
} = require("../../service/visitorActivity/buffer");
const { claimNotifySlot } = require("../../service/visitorActivity/notifySlot");
const {
  Visitor,
  VisitorContact,
  VisitorNotificationHistory,
} = require("../../models");

const DEV_CODES = {
  VISITOR_BLOCKED: "B01",
  NO_CONTACT: "C02",
  COOLDOWN_ACTIVE: "N03",
  OK: "S00",
};

// The 8-hour alert window now lives in service/visitorActivity/notifySlot.js,
// which owns both the check and the claim. Deliberately not duplicated here —
// two copies of the same number is how a rule quietly stops being one rule.

//POST /visitor/activity
exports.activity = async (req, res) => {
  const { visitorId, pageUrl } = req.body;

  if (!visitorId) {
    return res.status(400).json({
      error: "'visitorId' is required",
    });
  }

  if (!pageUrl) {
    return res.status(400).json({
      error: "'pageUrl' is required",
    });
  }

  const visitor = await Visitor.findByPk(visitorId);

  if (!visitor) {
    return res.status(404).json({
      error: "Visitor not found",
    });
  }

  // Update lastSeen + lastVisitedUrl always
  visitor.lastSeen = new Date();
  visitor.lastVisitedUrl = pageUrl;
  await visitor.save();

  if (visitor.isBlocked) {
    return res.status(200).json({ status: DEV_CODES.VISITOR_BLOCKED });
  }

  const lastContact = await VisitorContact.findOne({
    where: { visitorId },
    order: [["createdAt", "DESC"]],
  });

  // Nobody has told us who this browser belongs to yet — about four visitors in
  // five never will. Record the page view anyway, against the browser alone.
  //
  // These rows carry no phone, and nothing sends them to the CRM: there is no
  // person there to attach them to. They wait here. If this browser ever submits
  // a form, service/visitorActivity/claim.js stamps the phone onto all of them
  // and releases them at once — so the trail an agent opens starts weeks before
  // the form rather than at it. If it never does, the prune cron clears them.
  if (!lastContact) {
    bufferPageViewInBackground({ visitorId, pageUrl, contact: null, notified: false });
    return res.status(200).json({ status: DEV_CODES.NO_CONTACT });
  }

  // Same 8-hour rule as before, but the check and the claim are now a single
  // atomic step — two page views milliseconds apart could previously both pass
  // it and raise two alerts. See service/visitorActivity/notifySlot.js.
  const mayNotify = await claimNotifySlot(visitorId, visitor.notifiedAt);

  // Record the page view either way. This is the change that makes the browsing
  // trail possible: the cooldown is per PERSON, not per page, so a visit at
  // 2:00pm silences 2:01 and 2:05 — and those views used to be discarded right
  // here, unwritten and unrecoverable. Roughly four in five page views of a
  // known visitor were lost that way.
  //
  // One Redis command, never awaited, so it cannot slow or fail the request a
  // person's browser is waiting on.
  bufferPageViewInBackground({
    visitorId,
    pageUrl,
    contact: lastContact,
    notified: mayNotify,
  });

  if (!mayNotify) {
    return res.status(200).json({ status: DEV_CODES.COOLDOWN_ACTIVE });
  }

  const newEntry = await VisitorNotificationHistory.create({
    visitorId,
    name: lastContact.name,
    email: lastContact.email,
    phone: lastContact.phone,
    page: pageUrl,
    timestamp: new Date(),
  });

  visitor.notifiedAt = new Date();
  await visitor.save();

  // REAL-TIME BROADCAST
  NotificationSSE.broadcast("visitor_notification", newEntry);

  // Same moment, second destination: the CRM, where this becomes a lead under
  // "Website Visitors" so an agent can call them while the page is still open.
  // Not awaited — a slow or restarting CRM must never delay the visitor's page.
  // Anything that fails here is picked up by the hourly catch-up.
  sendVisitToCRMInBackground(newEntry);

  return res.status(200).json({ status: DEV_CODES.OK });
};
