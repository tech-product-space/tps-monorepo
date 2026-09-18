import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import {
  CreateProjectPayload,
  ProjectEmailType,
  ProjectLevel,
  ProjectSource,
  ProjectStatus,
  ProjectStep,
} from "@/gradient/types/project";

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/projects`;

export const projectService = {
  /* ── projects ─────────────────────────────────────────────────────────── */

  getAllProjects: async (params?: {
    page?: number;
    limit?: number;
    q?: string;
    categoryId?: string;
    level?: ProjectLevel;
    status?: ProjectStatus;
    source?: ProjectSource;
    isPublished?: boolean;
    sort?: string;
  }) => {
    const response = await PrivateAxios.get(`${BASE}/admin/projects`, {
      params,
    });
    return response.data;
  },

  getProjectById: async (id: string) => {
    const response = await PrivateAxios.get(`${BASE}/admin/projects/${id}`);
    return response.data;
  },

  /**
   * Unwrapped to `{ available }`. `useSlugAvailability` reads
   * `response.available` and falls back to `true` when it is undefined —
   * handing it the whole envelope would make every slug look free, including
   * taken ones.
   */
  checkSlugAvailability: async (slug: string, excludeId?: string) => {
    const response = await PrivateAxios.get(`${BASE}/admin/slug-availability`, {
      params: { slug, excludeId },
    });
    return response.data?.data;
  },

  createProject: async (data: CreateProjectPayload) => {
    const response = await PrivateAxios.post(`${BASE}/admin/create`, data);
    return response.data;
  },

  updateProject: async (id: string, data: Partial<CreateProjectPayload>) => {
    const response = await PrivateAxios.put(
      `${BASE}/admin/projects/${id}`,
      data,
    );
    return response.data;
  },

  toggleProjectStatus: async (id: string) => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/projects/${id}/toggle-status`,
    );
    return response.data;
  },

  deleteProject: async (id: string) => {
    const response = await PrivateAxios.delete(`${BASE}/admin/projects/${id}`);
    return response.data;
  },

  /* ── review ───────────────────────────────────────────────────────────── */

  /**
   * The only writer of the moderation state.
   *
   * Deliberately separate from `updateProject`, which strips `status` — so the
   * edit form cannot smuggle an approval through. Approving does **not**
   * publish: the panel routes into the edit form afterwards, because approval
   * is the start of the editing job rather than the end of it.
   */
  reviewProject: async (
    id: string,
    data: { decision: "approved" | "rejected"; rejectionReason?: string },
  ) => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/projects/${id}/review`,
      data,
    );
    return response.data;
  },

  /* ── guide steps ──────────────────────────────────────────────────────── */

  getSteps: async (projectId: string) => {
    const response = await PrivateAxios.get(
      `${BASE}/admin/projects/${projectId}/steps`,
    );
    return response.data;
  },

  getStepById: async (id: string) => {
    const response = await PrivateAxios.get(`${BASE}/admin/steps/${id}`);
    return response.data;
  },

  createStep: async (
    projectId: string,
    data: { title: string; slug?: string; content?: Record<string, unknown> },
  ) => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/projects/${projectId}/steps`,
      data,
    );
    return response.data;
  },

  updateStep: async (
    id: string,
    data: {
      title?: string;
      slug?: string;
      content?: Record<string, unknown>;
      order?: number;
    },
  ) => {
    const response = await PrivateAxios.put(`${BASE}/admin/steps/${id}`, data);
    return response.data;
  },

  toggleStepStatus: async (id: string) => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/steps/${id}/toggle-status`,
    );
    return response.data;
  },

  deleteStep: async (id: string) => {
    const response = await PrivateAxios.delete(`${BASE}/admin/steps/${id}`);
    return response.data;
  },

  /** One write for the whole order — see the backend controller for why. */
  reorderSteps: async (projectId: string, ids: string[]) => {
    const response = await PrivateAxios.put(
      `${BASE}/admin/projects/${projectId}/steps/reorder`,
      { ids },
    );
    return response.data;
  },

  /**
   * Bulk create from a .docx. The document is converted in the browser — see
   * the import dialog — so what travels here is ProseMirror JSON.
   */
  importSteps: async (
    projectId: string,
    steps: { title: string; slug: string; content: Record<string, unknown> }[],
  ) => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/projects/${projectId}/steps/import`,
      { steps },
    );

    return response.data as {
      success: boolean;
      message: string;
      data: ProjectStep[];
    };
  },

  publishAllSteps: async (projectId: string) => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/projects/${projectId}/steps/publish-all`,
    );
    return response.data;
  },

  checkStepSlugAvailability: async (
    projectId: string,
    slug: string,
    excludeId?: string,
  ) => {
    const response = await PrivateAxios.get(
      `${BASE}/admin/projects/${projectId}/steps/slug-availability`,
      { params: { slug, excludeId } },
    );
    return response.data?.data;
  },

  /* ── categories ───────────────────────────────────────────────────────── */

  getCategories: async () => {
    const response = await PrivateAxios.get(`${BASE}/admin/categories`);
    return response.data;
  },

  createCategory: async (data: {
    name: string;
    slug?: string;
    thumbnail?: string;
    description?: string;
  }) => {
    const response = await PrivateAxios.post(`${BASE}/admin/categories`, data);
    return response.data;
  },

  updateCategory: async (
    id: string,
    data: {
      name?: string;
      slug?: string;
      thumbnail?: string;
      isActive?: boolean;
      description?: string;
    },
  ) => {
    const response = await PrivateAxios.put(
      `${BASE}/admin/categories/${id}`,
      data,
    );
    return response.data;
  },

  reorderCategories: async (ids: string[]) => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/categories/reorder`,
      { ids },
    );
    return response.data;
  },

  /**
   * Returns `{ uncategorisedProjects }` — deleting is `SET NULL`, not a
   * cascade. The confirm dialog must say how many projects become
   * uncategorised rather than just "are you sure".
   */
  deleteCategory: async (id: string) => {
    const response = await PrivateAxios.delete(
      `${BASE}/admin/categories/${id}`,
    );
    return response.data;
  },

  /* ── leads ────────────────────────────────────────────────────────────── */

  getLeads: async (params?: {
    page?: number;
    limit?: number;
    q?: string;
    projectId?: string;
  }) => {
    const response = await PrivateAxios.get(`${BASE}/admin/leads`, { params });
    return response.data;
  },

  /* ── email templates ──────────────────────────────────────────────────── */

  /**
   * The global template and a project's override are rows in the same table —
   * `projectId IS NULL` is the global — which is why one editor component
   * serves both screens.
   */
  getGlobalEmailTemplate: async (type: ProjectEmailType) => {
    const response = await PrivateAxios.get(
      `${BASE}/admin/email-templates/${type}`,
    );
    return response.data;
  },

  saveGlobalEmailTemplate: async (
    type: ProjectEmailType,
    data: { subject: string; body: string; isEnabled?: boolean },
  ) => {
    const response = await PrivateAxios.put(
      `${BASE}/admin/email-templates/${type}`,
      data,
    );
    return response.data;
  },

  sendTestEmail: async (
    type: ProjectEmailType,
    data: { to: string; projectId?: string },
  ) => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/email-templates/${type}/test`,
      data,
    );
    return response.data;
  },

  /** Returns `{ override, global, effective, inheritedFromGlobal }`. */
  getProjectEmailTemplate: async (
    projectId: string,
    type: ProjectEmailType,
  ) => {
    const response = await PrivateAxios.get(
      `${BASE}/admin/projects/${projectId}/email/${type}`,
    );
    return response.data;
  },

  saveProjectEmailTemplate: async (
    projectId: string,
    type: ProjectEmailType,
    data: { subject: string; body: string; isEnabled?: boolean },
  ) => {
    const response = await PrivateAxios.put(
      `${BASE}/admin/projects/${projectId}/email/${type}`,
      data,
    );
    return response.data;
  },

  /** Drops the override so the project falls back to the global. */
  deleteProjectEmailTemplate: async (
    projectId: string,
    type: ProjectEmailType,
  ) => {
    const response = await PrivateAxios.delete(
      `${BASE}/admin/projects/${projectId}/email/${type}`,
    );
    return response.data;
  },
};
