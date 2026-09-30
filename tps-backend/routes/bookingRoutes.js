const express = require('express');

const calController  = require('../controllers/cal/calController');

const router = express.Router();

//BASE URL -> /booking

router.get("/cal-booking", calController.listBookings);

module.exports = router;