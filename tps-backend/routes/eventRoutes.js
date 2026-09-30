const express = require('express');
const router = express.Router();

const eventController = require('../controllers/eventController');
const certificateController = require('../controllers/eventCertificateController');
const emailTemplateController = require('../controllers/eventEmailTemplateController');

router.post('/register-event', eventController.registerEvent);

router.get("/events", eventController.getAllEvents);

// slug routes
router.get("/events/slug-availability", eventController.checkSlugAvailability);
router.get("/events/slug/:slug", eventController.getEventBySlug);

// user routes
router.post("/events/user", eventController.getUserEvents);
router.post("/events/user/feedback", eventController.submitEventFeedback);

// certificate routes
router.post('/events/certificate/save', certificateController.saveCertificateTemplate);
router.post('/events/certificate/generate', certificateController.generateCertificate);
router.post('/events/certificate/bulk-generate', certificateController.bulkGenerateCertificates);
router.post('/events/certificate/download-url', certificateController.getCertificateDownloadUrl);
router.post('/events/certificate/my-certificates', certificateController.getUserCertificates);
router.post('/events/certificate/latest-certificate', certificateController.getLatestCertificate);
router.put('/events/certificate/approve', certificateController.approveCertificate);
router.put('/events/certificate/bulk-approve', certificateController.bulkApproveCertificates);
router.post('/events/certificate/save-email-template', certificateController.saveEventEmailTemplate);
router.get('/events/certificate//email-template/:eventId', certificateController.getEmailTemplateByEvent);
router.get('/events/certificate/:eventId', certificateController.getCertificateTemplate);
router.post("/events/send-certificate-test-email", certificateController.sendCertificateTestEmail);

// feedback routes
router.get("/events/feedback/:eventId", eventController.getEventFeedbacks);
router.get("/events/feedback/:eventId/export", eventController.exportEventFeedbacks);

router.get("/events/:slug/success/:userId", eventController.getEventSuccessDetails);
router.get("/events/:id", eventController.getEventById);
router.put("/events/:id", eventController.updateEvent)
// router.delete("/events/:id", eventController.deleteEvent)
router.patch("/events/:id/toggle-response", eventController.toggleAcceptResponse);
router.post('/events/by-title', eventController.getEventByTitle);
router.post("/events/create", eventController.createEvent);
router.post("/events", eventController.createEventGuest); 
router.get("/past-events", eventController.getPastEvents);
router.post("/events/guests/by-id", eventController.getUsersByEventId);
router.post("/events/approve-guests", eventController.approveGuests);
router.post("/events/:id/publish", eventController.updateEventPublishStatus);
router.post("/events/:id/duplicate", eventController.duplicateEvent);
router.post("/events/check-guest-status", eventController.checkEventGuest);
router.get("/events/referrals/with-referees", eventController.getGuestsWithReferees);
router.post("/events/referrals/with-referees-by-slug", eventController.getGuestsWithRefereesBySlug);
router.post("/events/referrals/by-code", eventController.getRefereesByReferralCode);
router.get('/events/check-referral/:userId', eventController.checkReferralCodes);

// email
router.post('/events/save-email', eventController.saveEmailTemplate);
router.post('/events/get-email', eventController.getEmailTemplate);
//v2 email routes
router.post("/events/email/template/sendEmailNow", emailTemplateController.sendReminderEmailNow);
router.post("/events/:eventId/email/template", emailTemplateController.createTemplate);
router.get("/events/:eventId/email/templates", emailTemplateController.getTemplates);
router.get("/events/email/template/:templateId", emailTemplateController.getTemplateById);
router.put("/events/email/template/:templateId", emailTemplateController.updateTemplate);
router.delete("/events/email/template/:templateId", emailTemplateController.deleteTemplate);
router.post("/events/email/template/:templateId/schedule", emailTemplateController.scheduleTemplate);
router.post("/events/email/template/:templateId/cancel", emailTemplateController.cancelSchedule);
router.post("/events/email/template/:templateId/test", emailTemplateController.sendTestEmail);

router.post('/events/guest-type', eventController.getEventByIdWithGuestType);
router.get("/events/type/:slug", eventController.getEventTypeBySlug);
router.post("/events/feedbackStatus", eventController.getFeedbackStatus);
router.post("/events/get-whatsapp-link", eventController.getWhatsappLinkBySlug);

// 📝 Optional (if you re-enable later)
// router.get("/events/user/:id", eventController.getEventsByUserId);
// router.post("/events/by-name", eventController.getUsersByEventName);

module.exports = router;
