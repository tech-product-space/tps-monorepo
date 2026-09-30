const express = require('express');

const calController  = require('../controllers/cal/calController');

const router = express.Router();

//BASE URL -> /webhook

router.post("/cal", calController.webhook);

module.exports = router;