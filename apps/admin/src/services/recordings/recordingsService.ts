import { PrivateAxios, PrivateUploadAxios } from "@/helpers/PrivateAxios";
import {
  CreateRecordingPayload,
  RecordingLeadResponse,
  RecordingListResponse,
} from "@/types/recording";

const BASE = "/recordings";

/* ── recordings ───────────────────────────────────────────────────────────── */

export const getAllRecordings = async (params?: {
  page?: number;
  limit?: number;
  q?: string;
  categoryId?: string;
  isPublished?: boolean;
  /** One of `RECORDING_FORMATS`. */
  format?: string;
  sort?: string;
}): Promise<RecordingListResponse> => {
  const response = await PrivateAxios.get(`${BASE}/admin/recordings`, {
    params,
  });
  return response.data;
};

export const getRecordingById = async (id: string) => {
  const response = await PrivateAxios.get(`${BASE}/admin/recordings/${id}`);
  return response.data;
};

/**
 * Unwrapped to `{ available }`. The editor reads `response.available` and falls
 * back to "available" when it is undefined — handing it the whole envelope would
 * make every slug look free, including taken ones.
 */
export const checkSlugAvailability = async (
  slug: string,
  excludeId?: string
): Promise<{ available: boolean }> => {
  const response = await PrivateAxios.get(`${BASE}/admin/slug-availability`, {
    params: { slug, excludeId },
  });
  return response.data?.data;
};

export const createRecording = async (data: CreateRecordingPayload) => {
  const response = await PrivateAxios.post(`${BASE}/admin/create`, data);
  return response.data;
};

export const updateRecording = async (
  id: string,
  data: Partial<CreateRecordingPayload>
) => {
  const response = await PrivateAxios.put(
    `${BASE}/admin/recordings/${id}`,
    data
  );
  return response.data;
};

export const toggleRecordingStatus = async (id: string) => {
  const response = await PrivateAxios.patch(
    `${BASE}/admin/recordings/${id}/toggle-status`
  );
  return response.data;
};

export const deleteRecording = async (id: string) => {
  const response = await PrivateAxios.delete(`${BASE}/admin/recordings/${id}`);
  return response.data;
};

/* ── categories ───────────────────────────────────────────────────────────── */

export const getRecordingCategories = async () => {
  const response = await PrivateAxios.get(`${BASE}/admin/categories`);
  return response.data;
};

export const createRecordingCategory = async (data: {
  name: string;
  slug?: string;
  description?: string;
}) => {
  const response = await PrivateAxios.post(`${BASE}/admin/categories`, data);
  return response.data;
};

export const updateRecordingCategory = async (
  id: string,
  data: {
    name?: string;
    slug?: string;
    isActive?: boolean;
    description?: string;
  }
) => {
  const response = await PrivateAxios.put(
    `${BASE}/admin/categories/${id}`,
    data
  );
  return response.data;
};

/** One write for the whole order — see the backend controller for why. */
export const reorderRecordingCategories = async (ids: string[]) => {
  const response = await PrivateAxios.patch(`${BASE}/admin/categories/reorder`, {
    ids,
  });
  return response.data;
};

export const deleteRecordingCategory = async (id: string) => {
  const response = await PrivateAxios.delete(`${BASE}/admin/categories/${id}`);
  return response.data;
};

/* ── preview ──────────────────────────────────────────────────────────────── */

/**
 * MINT A PREVIEW LINK TOKEN
 *
 * Single-use and minutes long. Exchanged by the public site for an httpOnly
 * session cookie, which is what actually lifts the publish filters and releases
 * the gated video — see `lib/preview.ts`. Mint one per click rather than
 * caching: a token held in component state goes stale in fifteen minutes and
 * fails on the one click that matters.
 */
export const createRecordingPreviewToken = async (
  recordingId: string
): Promise<{ success: boolean; data: { token: string; slug: string } }> => {
  const response = await PrivateAxios.post(
    `${BASE}/admin/recordings/${recordingId}/preview-token`
  );
  return response.data;
};

/* ── leads ────────────────────────────────────────────────────────────────── */

export const getRecordingLeads = async (params?: {
  page?: number;
  limit?: number;
  recordingId?: string;
  email?: string;
}): Promise<RecordingLeadResponse> => {
  const response = await PrivateAxios.get(`${BASE}/admin/leads`, { params });
  return response.data;
};

/* ── images ───────────────────────────────────────────────────────────────── */

export interface LibraryImage {
  key: string;
  /** The key without its folder prefix — what the tile shows. */
  name: string;
  url: string;
  size: number;
  lastModified: string;
}

/** The picker's tabs. Mirrors `LIBRARY_PREFIXES` on the backend. */
export type LibraryType =
  | "recordings"
  | "events"
  | "blogs"
  | "ai-products"
  | "projects";

/**
 * Everything already uploaded under one folder, newest first.
 *
 * Backs the picker. Speaker photos and company logos repeat across recordings —
 * and a speaker who already appeared on an event page has a photo in `events/`
 * too, which is why the picker can see more than its own folder.
 */
export const getLibraryImages = async (
  type: LibraryType
): Promise<{ files: LibraryImage[]; truncated: boolean }> => {
  const response = await PrivateAxios.get("/upload/library", {
    params: { type },
  });
  return {
    files: response.data?.files ?? [],
    // True when the folder holds more keys than the API will walk. Surfaced so
    // "I cannot find my image" has an answer on screen.
    truncated: Boolean(response.data?.truncated),
  };
};

export const deleteLibraryImage = async (key: string) => {
  const response = await PrivateAxios.delete("/upload/library", {
    data: { key },
  });
  return response.data;
};

/**
 * Thumbnails, speaker photos and "previously at" logos.
 *
 * Returns the public URL, which is what gets stored — every recording image is a
 * plain URL on the row, not a key that something has to resolve later.
 */
export const uploadRecordingImage = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await PrivateUploadAxios.post(
    "/upload/recordings",
    formData
  );
  return response.data.fileUrl;
};
