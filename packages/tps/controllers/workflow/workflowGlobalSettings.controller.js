"use strict";

const {
  getGlobalSettings,
  updateGlobalSettings,
  DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_LEAD,
} = require("../../service/workflow/settings/globalSettings");

exports.getSettings = async (req, res) => {
  try {
    const settings = await getGlobalSettings();
    return res.status(200).json({
      settings,
      defaults: {
        max_active_workflows_per_lead: DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_LEAD,
      },
    });
  } catch (error) {
    console.error("getWorkflowGlobalSettings error:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch workflow global settings" });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const settings = await updateGlobalSettings(
      req.body || {},
      req.user?.id || null
    );
    return res.status(200).json({ settings });
  } catch (error) {
    if (error?.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("updateWorkflowGlobalSettings error:", error);
    return res
      .status(500)
      .json({ message: "Failed to update workflow global settings" });
  }
};
