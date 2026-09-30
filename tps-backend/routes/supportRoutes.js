const express = require("express");
const router = express.Router();

const upload = require("../middlewares/uploadSupport");
const requireUser = require("../middlewares/requireUser");
const requireStaff = require("../middlewares/requireStaff");
const ctrl = require("../controllers/support/supportTicket.controller");

const attachments = upload.array("attachments", 5);

/* ----------------------------- User (logged-in) ----------------------------- */
router.post("/tickets", requireUser, attachments, ctrl.createTicket);
router.get("/tickets", requireUser, ctrl.listMyTickets);
router.get("/tickets/:id", requireUser, ctrl.getMyTicket);
router.post("/tickets/:id/messages", requireUser, attachments, ctrl.addUserMessage);
router.post("/tickets/:id/phone", requireUser, ctrl.submitPhone);

/* --------------------------------- Staff ----------------------------------- */
router.get("/admin/tickets", requireStaff, ctrl.listTickets);
router.get("/admin/stats", requireStaff, ctrl.getStats);
router.get("/admin/tickets/:id", requireStaff, ctrl.getTicket);
router.post("/admin/tickets/:id/messages", requireStaff, attachments, ctrl.addStaffMessage);
router.post("/admin/tickets/:id/request-phone", requireStaff, ctrl.requestPhone);
router.patch("/admin/tickets/:id", requireStaff, ctrl.updateTicket);

module.exports = router;
