import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import { cleanHtml } from "@/gradient/lib/cleanHtml";
import type { IPaginationMeta } from "@/gradient/types/pagination";
import type {
  AudiencePreview,
  ConditionOption,
  Enrollment,
  EnrollmentDetail,
  EnrollmentStatus,
  RunStatus,
  SendEmailConfig,
  TriggerConfig,
  ValidationResult,
  Workflow,
  WorkflowDefinition,
  WorkflowDetail,
  WorkflowHealth,
  WorkflowReport,
  WorkflowStatus,
  WorkflowTriggerType,
} from "@/gradient/types/workflow";

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/workflows/admin`;

export type WorkflowUpdatePayload = Partial<{
  name: string;
  description: string | null;
  triggerType: WorkflowTriggerType | null;
  triggerConfig: TriggerConfig;
  definition: WorkflowDefinition;
}>;

/**
 * Sanitise every authored body before it leaves the browser.
 *
 * The same `cleanHtml` the campaign service uses, so a workflow email and a
 * campaign email cannot drift apart in what they allow through.
 */
const sanitiseDefinition = (
  definition: WorkflowDefinition,
): WorkflowDefinition => ({
  ...definition,
  nodes: definition.nodes.map((node) =>
    node.type === "sendEmail"
      ? {
          ...node,
          config: {
            ...node.config,
            body: cleanHtml((node.config as SendEmailConfig).body || ""),
          },
        }
      : node,
  ),
});

export const workflowService = {
  async list(params?: {
    status?: WorkflowStatus | null;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const res = await PrivateAxios.get(`${BASE}/workflows`, { params });
    return res.data as { data: Workflow[]; meta: IPaginationMeta };
  },

  async get(id: string) {
    const res = await PrivateAxios.get(`${BASE}/workflows/${id}`);
    return (res.data as { data: WorkflowDetail }).data;
  },

  async create(name: string, description?: string) {
    const res = await PrivateAxios.post(`${BASE}/workflows`, {
      name,
      description,
    });
    return (res.data as { data: Workflow }).data;
  },

  async update(id: string, payload: WorkflowUpdatePayload) {
    const body = payload.definition
      ? { ...payload, definition: sanitiseDefinition(payload.definition) }
      : payload;

    const res = await PrivateAxios.put(`${BASE}/workflows/${id}`, body);
    return res.data as { data: Workflow; validation: ValidationResult };
  },

  async archive(id: string) {
    const res = await PrivateAxios.delete(`${BASE}/workflows/${id}`);
    return (res.data as { data: { cancelledEnrollments: number } }).data;
  },

  async duplicate(id: string) {
    const res = await PrivateAxios.post(`${BASE}/workflows/${id}/duplicate`);
    return (res.data as { data: Workflow }).data;
  },

  async validate(id: string) {
    const res = await PrivateAxios.post(`${BASE}/workflows/${id}/validate`);
    return (res.data as { data: ValidationResult }).data;
  },

  /**
   * Publish.
   *
   * A 422 carries `errors[]` — the panel renders them as a checklist rather
   * than a toast, so the caller is left to catch it. Every other failure is an
   * ordinary error.
   */
  async publish(id: string) {
    const res = await PrivateAxios.post(`${BASE}/workflows/${id}/publish`);
    return (res.data as { data: { workflow: Workflow; version: number } }).data;
  },

  async pause(id: string) {
    const res = await PrivateAxios.post(`${BASE}/workflows/${id}/pause`);
    return (res.data as { data: Workflow }).data;
  },

  async resume(id: string) {
    const res = await PrivateAxios.post(`${BASE}/workflows/${id}/resume`);
    return (res.data as { data: { workflow: Workflow; requeued: number } }).data;
  },

  async run(id: string) {
    const res = await PrivateAxios.post(`${BASE}/workflows/${id}/run`);
    return (res.data as { data: { runId: string } }).data;
  },

  /**
   * Is that Run still going?
   *
   * Run is queued, not done inline, so the response says "started" and nothing
   * more. This is how the header knows to keep Pause reachable and to hold off
   * ticking "Run it" until the enrolling has actually finished.
   */
  async runStatus(id: string) {
    const res = await PrivateAxios.get(`${BASE}/workflows/${id}/run-status`);
    return (res.data as { data: RunStatus }).data;
  },

  /** The count the publish dialog states before an admin commits. */
  async audience(id: string) {
    const res = await PrivateAxios.get(`${BASE}/workflows/${id}/audience`);
    return (res.data as { data: AudiencePreview }).data;
  },

  /**
   * Per-step numbers, including the branch yes/no split.
   *
   * Computed on read rather than kept as counters — a denormalised total that
   * drifts from the rows it counts is worse than a slightly slower query, and
   * this one is opened by hand a few times a day.
   */
  async report(id: string) {
    const res = await PrivateAxios.get(`${BASE}/workflows/${id}/report`);
    return (res.data as { data: WorkflowReport }).data;
  },

  async enrolOne(id: string, email: string, name?: string) {
    const res = await PrivateAxios.post(`${BASE}/workflows/${id}/enroll`, {
      email,
      name,
    });
    return (res.data as { data: { enrollmentId: string } }).data;
  },

  async sendTest(id: string | null, to: string, config: SendEmailConfig) {
    const url = id
      ? `${BASE}/workflows/${id}/test-email`
      : `${BASE}/workflows/test-email`;

    const res = await PrivateAxios.post(url, {
      to,
      config: { ...config, body: cleanHtml(config.body || "") },
    });
    return res.data as { success: boolean };
  },

  /* ── enrolments ───────────────────────────────────────────────────────── */

  async listEnrollments(params?: {
    workflowId?: string;
    status?: EnrollmentStatus | null;
    email?: string;
    page?: number;
    limit?: number;
  }) {
    const res = await PrivateAxios.get(`${BASE}/enrollments`, { params });
    return res.data as { data: Enrollment[]; meta: IPaginationMeta };
  },

  async getEnrollment(id: string) {
    const res = await PrivateAxios.get(`${BASE}/enrollments/${id}`);
    return (res.data as { data: EnrollmentDetail }).data;
  },

  async cancelEnrollment(id: string) {
    await PrivateAxios.post(`${BASE}/enrollments/${id}/cancel`);
  },

  async bulkCancel(payload: { workflowId?: string; ids?: string[] }) {
    const res = await PrivateAxios.post(
      `${BASE}/enrollments/bulk-cancel`,
      payload,
    );
    return (res.data as { data: { cancelled: number } }).data;
  },

  /* ── settings and health ──────────────────────────────────────────────── */

  async getSettings() {
    const res = await PrivateAxios.get(`${BASE}/settings`);
    return (
      res.data as {
        data: {
          settings: { maxActiveWorkflowsPerPerson: number };
          defaults: { maxActiveWorkflowsPerPerson: number };
        };
      }
    ).data;
  },

  async updateSettings(maxActiveWorkflowsPerPerson: number) {
    const res = await PrivateAxios.put(`${BASE}/settings`, {
      maxActiveWorkflowsPerPerson,
    });
    return res.data;
  },

  /**
   * What an if/then step can ask about.
   *
   * Served by the backend rather than listed here, so a condition the product
   * does not actually record can never be offered in the editor.
   */
  async conditions() {
    const res = await PrivateAxios.get(`${BASE}/conditions`);
    return (res.data as { data: ConditionOption[] }).data;
  },

  /**
   * Is any of this running?
   *
   * Read by the banner on the list page. Without it, a live workflow enrolling
   * nobody is indistinguishable from a bad filter, and that is an hour of
   * somebody's afternoon.
   */
  async health() {
    const res = await PrivateAxios.get(`${BASE}/health`);
    return (res.data as { data: WorkflowHealth }).data;
  },
};
