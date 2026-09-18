import { PrivateAxios } from "@/helpers/PrivateAxios";

export type WorkflowGlobalSettings = {
  id: number;
  max_active_workflows_per_lead: number;
  updated_by: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowGlobalSettingsResponse = {
  settings: WorkflowGlobalSettings;
  defaults: {
    max_active_workflows_per_lead: number;
  };
};

const BASE = "/api/v1/workflow-global-settings";

export const workflowGlobalSettingsService = {
  async get(): Promise<WorkflowGlobalSettingsResponse> {
    const res = await PrivateAxios.get(BASE);
    return res.data;
  },

  async update(payload: {
    max_active_workflows_per_lead: number;
  }): Promise<WorkflowGlobalSettings> {
    const res = await PrivateAxios.put(BASE, payload);
    return res.data.settings;
  },
};
