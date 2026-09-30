const Register = require("./notifications/Register");
const Approved = require("./notifications/Approved");
const Waitlist = require("./notifications/Waitlist");
const Hackathon = require("./notifications/Hackathon");

const templateMap = {
  "registerEmail": Register,
  "approvedEmail": Approved,
  "waitlistEmail": Waitlist,
  "HackathonEmail": Hackathon,
};

module.exports = templateMap;