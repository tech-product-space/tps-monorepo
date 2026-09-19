"use strict";
const psEnv = require("@ps/env/crm");
const googleService = require("../services/google.service");

function frontendUrl() {
  return psEnv.FRONTEND_URL || "http://localhost:5173";
}

// GET /api/v1/integrations/google/connect (auth) → { url }
exports.googleConnect = async (req, res) => {
  try {
    const url = googleService.buildAuthUrl(req.user.id);
    res.json({ url });
  } catch (err) {
    console.error("googleConnect error:", err);
    res.status(500).json({ error: "Failed to build Google auth URL" });
  }
};

// GET /api/v1/integrations/google/callback (unauthenticated — Google redirects here)
exports.googleCallback = async (req, res) => {
  const { code, state, error } = req.query;
  const base = `${frontendUrl()}/settings/integrations`;
  if (error || !code || !state) {
    return res.redirect(
      `${base}?google=error&reason=${encodeURIComponent(error || "missing_code")}`,
    );
  }
  try {
    await googleService.handleCallback(code, state);
    res.redirect(`${base}?google=connected`);
  } catch (err) {
    console.error("googleCallback error:", err);
    res.redirect(
      `${base}?google=error&reason=${encodeURIComponent(err.message || "link_failed")}`,
    );
  }
};

// GET /api/v1/integrations/google/status (auth) → { connected, email, status }
exports.googleStatus = async (req, res) => {
  try {
    const integration = await googleService.getIntegration(req.user.id);
    if (!integration) {
      return res.json({ connected: false, email: null, status: null });
    }
    res.json({
      connected: integration.status === "connected",
      email: integration.google_email,
      status: integration.status,
    });
  } catch (err) {
    console.error("googleStatus error:", err);
    res.status(500).json({ error: "Failed to fetch integration status" });
  }
};

// DELETE /api/v1/integrations/google (auth) → { success }
exports.googleDisconnect = async (req, res) => {
  try {
    await googleService.disconnect(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error("googleDisconnect error:", err);
    res.status(500).json({ error: "Failed to disconnect Google" });
  }
};
