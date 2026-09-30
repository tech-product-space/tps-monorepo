const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/whatsappTemplate.controller");
const { authenticate } = require("../middlewares/auth.middleware");

//BASE URL: /api/v1/whatsapp-templates

router.use(authenticate);

router.get("/variables", ctrl.getVariables);
router.get("/", ctrl.getAll);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
