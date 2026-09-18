import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import type {
  ActivityFiltersResponse,
  ActivityLogListResponse,
  ActivityLogQuery,
} from "@/gradient/types/activity";

const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/activity-logs`;

/**
 * Read-only. The backend exposes no write endpoints for activity logs — rows are
 * written by its middleware — so there is deliberately nothing to POST here.
 */
export const activityService = {
  getLogs: async (
    params?: ActivityLogQuery,
  ): Promise<ActivityLogListResponse> => {
    const response = await PrivateAxios.get(`${BASE_URL}/admin/logs`, {
      params,
    });
    return response.data;
  },

  /** Backs <ActivityTimeline /> on a record's detail page. */
  getEntityLogs: async (
    entityType: string,
    entityId: string,
    params?: { page?: number; limit?: number },
  ): Promise<ActivityLogListResponse> => {
    const response = await PrivateAxios.get(
      `${BASE_URL}/admin/logs/entity/${entityType}/${entityId}`,
      { params },
    );
    return response.data;
  },

  /** Only values present in the table, so no filter option returns nothing. */
  getFilters: async (): Promise<ActivityFiltersResponse> => {
    const response = await PrivateAxios.get(`${BASE_URL}/admin/logs/filters`);
    return response.data;
  },

  downloadCsv: async (params?: ActivityLogQuery) => {
    const response = await PrivateAxios.get(`${BASE_URL}/admin/logs/export`, {
      params,
      responseType: "blob",
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");

    link.href = url;
    link.setAttribute("download", "activity-log.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
