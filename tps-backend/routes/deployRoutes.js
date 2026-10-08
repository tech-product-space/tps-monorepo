const express = require("express");
const requireDeployer = require("../middlewares/requireDeployer");
const { me, status, start, run, getEnv, saveEnv } = require("../controllers/deployController");

const router = express.Router();

// Only DEPLOY_ADMIN_EMAILS; everyone else gets 404 from requireDeployer.
router.use(requireDeployer);

router.get("/me", me);
router.get("/status", status);
router.post("/", start);
router.get("/runs/:id", run);
router.get("/env/:backend", getEnv);
router.put("/env/:backend", saveEnv);

module.exports = router;
