const express = require('express');
const router = express.Router();
const calController = require('../controllers/webhook/cal.controller');
const { handle } = require('../controllers/webhook/payment.controller');
const websiteVisitController = require('../controllers/webhook/websiteVisit.controller');
const websiteActivityController = require('../controllers/webhook/websiteActivity.controller');

// Cal.com, one route per brand's Cal.com account. The bare path is kept and
// resolves to the default (TPS) account, so the webhook already configured in
// Cal.com keeps delivering without being re-pointed; additional brands use
// /cal/<account key> (see config/calcom.js).
router.post('/cal',
        express.json(),
        express.urlencoded({ extended: true }),
        calController.webhook);
router.post('/cal/:account',
        express.json(),
        express.urlencoded({ extended: true }),
        calController.webhook);
// Generic payment-webhook handler, one route per gateway.
router.post('/razorpay', express.raw({ type: "application/json" }), handle('razorpay'));
router.post('/cashfree', express.raw({ type: "*/*" }), handle('cashfree'));

// Website visits from TPS. Raw body because the shared-secret signature is
// checked against the exact bytes sent — see the controller.
router.post('/website-visit',
        express.raw({ type: "application/json" }),
        websiteVisitController.handle);

// Bulk page-view feed. Same secret, same raw-body rule, but batched — so the
// limit has to be raised: express.raw defaults to 100kb, and 500 rows is a few
// hundred. A batch over the limit would be rejected as a bad signature, since
// the body never arrives to be verified.
router.post('/website-activity',
        express.raw({ type: "application/json", limit: "5mb" }),
        websiteActivityController.handle);

module.exports = router;
