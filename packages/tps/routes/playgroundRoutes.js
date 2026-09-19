// ==============================================
// BACK-END  ➜  routes/playgroundRoutes.js
// ==============================================
const express = require("express");
const router = express.Router();
const { runQuery, endSession } = require("../controllers/playgroundController");
const attachSession = require("../middlewares/attachSession");

router.use(attachSession);
router.post("/run", runQuery);
router.post("/end-session", endSession);

module.exports = router;
