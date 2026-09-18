const express = require("express");
const router = express.Router();

const metaController = require("../controllers/integrations/meta.controller");

router.get("/meta/connect", metaController.connect);
router.get("/meta/callback", metaController.callback);

router.get("/meta", metaController.listMetaIntegrations);
router.delete("/meta/:id", metaController.deleteIntegration);

// meta pages
router.get("/meta/pages/:pageId", metaController.getPage);
router.post("/meta/:id/sync-pages", metaController.syncPages);
router.get("/meta/:id/pages", metaController.getPages);

//meta pages lead form
router.post("/meta/pages/:pageId/sync-forms", metaController.syncForms);
router.get("/meta/pages/:pageId/forms", metaController.getForms);

module.exports = router;