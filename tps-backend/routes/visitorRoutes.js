const express = require('express');
const router = express.Router();
const asyncWrapper = require('../utils/asyncWrapper');

const visitorController = require('../controllers/visitor/visitorController');
const visitorContactController = require('../controllers/visitor/visitorContactController');
const visitorActivityController = require('../controllers/visitor/visitorActivityController');
const notificationController = require('../controllers/visitor/notificationController');

// BASE_URL: /visitor

// contact routes
router.post("/contact/create", asyncWrapper(visitorContactController.createContact));
router.get("/contacts/:visitorId", asyncWrapper(visitorContactController.viewContacts));

//activity routes
router.post("/activity", asyncWrapper(visitorActivityController.activity));

//notification
router.get("/notifications", asyncWrapper(notificationController.getNotifications));
router.get("/notifications/export", asyncWrapper(notificationController.exportNotifications));
router.get("/notifications/unread-count", asyncWrapper(notificationController.getUnreadCount));
router.post("/notification/mark-read", asyncWrapper(notificationController.markAsRead));

//visitor crud
router.get("/", asyncWrapper(visitorController.getAllVisitors));
router.post("/create", asyncWrapper(visitorController.createVisitor));
router.get("/blocked", asyncWrapper(visitorController.getBlockedVisitors));
router.post("/block/:visitorId", asyncWrapper(visitorController.blockVisitor));
router.post("/unblock/:visitorId", asyncWrapper(visitorController.unblockVisitor));
router.get("/:visitorId", asyncWrapper(visitorController.viewVisitor));

module.exports = router;
