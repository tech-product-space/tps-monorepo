const express = require("express");
const router = express.Router();

const leadController = require("../controllers/externalLeads/lead.controller");
const metaLeadController = require("../controllers/externalLeads/metaLead.controller");

// BASE: /leads/external

router.post("/lead-types", leadController.createLeadType);
router.get("/lead-types", leadController.getLeadTypes);
router.post("/lead-types/map/meta-form", leadController.assignMetaFormToLeadTypes);

router.get("/meta", metaLeadController.getMetaLeads);
router.get("/meta/filters", metaLeadController.getMetaLeadFilters);
router.get("/meta/forms", metaLeadController.getAllMetaForms);
router.post("/meta/forms/:formId/sync-leads", metaLeadController.syncMetaFormLeads);

module.exports = router;
