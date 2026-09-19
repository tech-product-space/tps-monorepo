const service = require("../services/push.service");
const { publicKey, isConfigured } = require("../config/webpush");

const getVapidKey = (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: "Push notifications are not configured." });
  }
  res.json({ publicKey });
};

const subscribe = async (req, res) => {
  try {
    const { subscription } = req.body || {};
    await service.saveSubscription(
      req.user.id,
      subscription,
      req.headers["user-agent"],
    );
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to save subscription." });
  }
};

const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    await service.removeSubscription(endpoint);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to remove subscription." });
  }
};

module.exports = { getVapidKey, subscribe, unsubscribe };
