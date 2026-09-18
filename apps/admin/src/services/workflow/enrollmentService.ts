import { PrivateAxios } from "@/helpers/PrivateAxios";
import type {
  Enrollment,
  EnrollmentListResponse,
  EnrollmentStatus,
  LeadEvent,
  LeadSourceType,
  WorkflowNodeRun,
} from "@/types/workflow";

const BASE = "/api/v1/enrollments";

export type TriggerSource = {
  kind: "new_lead" | "static_list" | "manual" | string;
  source_type: string;
  source_id: string;
  label: string;
  form_type?: string | null;
  event_id?: number | null;
  event_name?: string | null;
  resource_id?: number | null;
  resource_name?: string | null;
  run_id?: string | null;
};

export const enrollmentService = {
  async list(params?: {
    workflow_id?: string;
    status?: EnrollmentStatus;
    lead_source_type?: LeadSourceType;
    lead_source_id?: string;
    page?: number;
    limit?: number;
  }): Promise<EnrollmentListResponse> {
    const res = await PrivateAxios.get(BASE, { params });
    return res.data;
  },

  async get(id: string): Promise<{
    enrollment: Enrollment & { nodeRuns?: WorkflowNodeRun[] };
    workflow: { id: string; name: string; status: string; current_version: number | null };
    trigger_source?: TriggerSource;
  }> {
    const res = await PrivateAxios.get(`${BASE}/${id}`);
    return res.data;
  },

  async logs(id: string): Promise<{
    enrollment_id: string;
    node_runs: WorkflowNodeRun[];
  }> {
    const res = await PrivateAxios.get(`${BASE}/${id}/logs`);
    return res.data;
  },

  async events(id: string): Promise<{
    enrollment_id: string;
    events: LeadEvent[];
  }> {
    const res = await PrivateAxios.get(`${BASE}/${id}/events`);
    return res.data;
  },

  async cancel(id: string, reason?: string): Promise<Enrollment> {
    const res = await PrivateAxios.post(`${BASE}/${id}/cancel`, { reason });
    return res.data.enrollment;
  },

  async bulkCancel(
    workflowId: string,
    reason?: string
  ): Promise<{ cancelled: number }> {
    const res = await PrivateAxios.post(`${BASE}/bulk-cancel`, {
      workflow_id: workflowId,
      reason,
    });
    return res.data;
  },
};

export const leadConsentService = {
  async optOut(payload: {
    lead_source_type: LeadSourceType;
    lead_source_id: string;
    channel: "email" | "whatsapp";
    reason?: string;
  }): Promise<{ enrollments_cancelled: number }> {
    const res = await PrivateAxios.post("/api/v1/leads/opt-out", payload);
    return res.data;
  },
};
