const jwt = require("jsonwebtoken");

const SECRET = process.env.LEAD_TOKEN_SECRET;

exports.generateLeadToken = (lead) => {
  return jwt.sign(
    {
      leadId: lead.id,
      email: lead.email,
    },
    SECRET,
    { expiresIn: "30m" }
  );
};

exports.verifyLeadToken = (token) => {
  return jwt.verify(token, SECRET);
};
