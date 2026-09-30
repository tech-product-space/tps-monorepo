"use strict";

const { sign, verify } = require("./trackingToken");

function mintUnsubscribeToken({ leadSourceType, leadSourceId, messageId }) {
  if (!leadSourceType || !leadSourceId) return null;
  return sign({
    k: "u",
    t: leadSourceType,
    s: String(leadSourceId),
    m: messageId || null,
    iat: Math.floor(Date.now() / 1000),
  });
}

function verifyUnsubscribeToken(token) {
  const data = verify(token);
  if (!data || data.k !== "u" || !data.t || !data.s) return null;
  return {
    leadSourceType: data.t,
    leadSourceId: data.s,
    messageId: data.m || null,
    issuedAt: data.iat || null,
  };
}

module.exports = { mintUnsubscribeToken, verifyUnsubscribeToken };
