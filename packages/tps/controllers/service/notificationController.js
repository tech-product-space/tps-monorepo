const { NotificationSSE } = require("../../config/SSE");

exports.notificationStream = async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).send("userId is required");

  NotificationSSE.setupSSE(res);
  NotificationSSE.addClient(userId, res, req);

  res.write(`event: connected\ndata: "connected"\n\n`);
};
