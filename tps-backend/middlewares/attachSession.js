// ==============================================
// BACK-END  ➜  middlewares/attachSession.js
// ==============================================
const { createSession } = require("../config/connectionManager");

module.exports = async (req, res, next) => {
  const sessionId = req.header("x-session-id");
  if (!sessionId) return res.status(400).json({ error: "Missing X-Session-Id" });

  try {
    req.db = await createSession(sessionId);
    req.sessionId = sessionId;
    next();
  } catch (err) {
    console.error("DB session error:", err);
    res.status(500).json({ error: "DB session error", details: err.message });
  }
};
