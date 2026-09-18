import { PrivateAxios } from "@/helpers/PrivateAxios";
import type {
  Workflow,
  WorkflowDetail,
  WorkflowListResponse,
  WorkflowStatus,
  ValidateResponse,
  PublishResponse,
  RunResponse,
} from "@/types/workflow";

const BASE = "/api/v1/workflows";

export const workflowService = {
  async list(params?: {
    status?: WorkflowStatus;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<WorkflowListResponse> {
    const res = await PrivateAxios.get(BASE, { params });
    return res.data;
  },

  async get(id: string): Promise<WorkflowDetail> {
    const res = await PrivateAxios.get(`${BASE}/${id}`);
    return res.data;
  },

  async create(payload: {
    name: string;
    description?: string;
  }): Promise<Workflow> {
    const res = await PrivateAxios.post(BASE, payload);
    return res.data.workflow;
  },

  async update(id: string, payload: Partial<Workflow>): Promise<Workflow> {
    const res = await PrivateAxios.put(`${BASE}/${id}`, payload);
    return res.data.workflow;
  },

  async archive(id: string): Promise<void> {
    await PrivateAxios.delete(`${BASE}/${id}`);
  },

  async duplicate(id: string): Promise<Workflow> {
    const res = await PrivateAxios.post(`${BASE}/${id}/duplicate`);
    return res.data.workflow;
  },

  async validate(id: string): Promise<ValidateResponse> {
    const res = await PrivateAxios.post(`${BASE}/${id}/validate`);
    return res.data;
  },

  async publish(id: string): Promise<PublishResponse> {
    const res = await PrivateAxios.post(`${BASE}/${id}/publish`);
    return res.data;
  },

  async run(id: string): Promise<RunResponse> {
    const res = await PrivateAxios.post(`${BASE}/${id}/run`);
    return res.data;
  },

  async pause(id: string): Promise<Workflow> {
    const res = await PrivateAxios.post(`${BASE}/${id}/pause`);
    return res.data.workflow;
  },

  async resume(id: string): Promise<Workflow> {
    const res = await PrivateAxios.post(`${BASE}/${id}/resume`);
    return res.data.workflow;
  },

  async enrollOne(
    id: string,
    payload: { lead_source_type: string; lead_source_id: string }
  ): Promise<{ enrollment_id: string }> {
    const res = await PrivateAxios.post(`${BASE}/${id}/enroll-one`, payload);
    return res.data;
  },

  async sendTestEmail(payload: {
    subject: string;
    html_body: string;
    from_email: string;
    from_name: string;
    to_email: string;
  }): Promise<{ message: string }> {
    const res = await PrivateAxios.post(`${BASE}/test-email`, payload);
    return res.data;
  },
};
