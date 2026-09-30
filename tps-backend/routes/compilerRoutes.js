const express = require("express");
const { compileCode } = require("../controllers/compilerController");

const router = express.Router();

router.post("/execute", compileCode);

module.exports = router;