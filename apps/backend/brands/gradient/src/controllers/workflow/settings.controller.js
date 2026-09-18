import {
  getWorkflowSettings,
  updateWorkflowSettings,
  WORKFLOW_SETTING_DEFAULTS,
} from "../../services/workflow/settings.service.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";

/**
 * The global cap.
 *
 * Returned with its default alongside, so the settings page can say "1
 * (default)" rather than leaving an admin to wonder whether someone changed it.
 */
export const getSettings = asyncWrapper(async (req, res) => {
  const settings = await getWorkflowSettings();

  return res.json({
    success: true,
    data: { settings, defaults: WORKFLOW_SETTING_DEFAULTS },
  });
});

export const updateSettings = asyncWrapper(async (req, res) => {
  const row = await updateWorkflowSettings(req.body, {
    updatedBy: req.admin?.id ?? null,
  });

  req.activity?.set({
    metadata: { maxActiveWorkflowsPerPerson: row.maxActiveWorkflowsPerPerson },
  });

  return res.json({ success: true, data: { settings: row } });
});
