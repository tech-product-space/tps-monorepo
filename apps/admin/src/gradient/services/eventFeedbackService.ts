import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import {
  EventFeedbackExportResponse,
  EventFeedbackListResponse,
  EventSettings,
} from "@/gradient/types/eventFeedback";

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/events`;

export const eventFeedbackService = {
  /**
   * `search` matches the submitter's name or email **and** any teammate named
   * on the response — a teammate exists nowhere else, so searching the
   * submitter alone would never find them.
   */
  list: async (
    eventId: string,
    page = 1,
    limit = 10,
    search?: string,
  ): Promise<EventFeedbackListResponse> => {
    const response = await PrivateAxios.get(`${BASE}/feedback/admin/${eventId}`, {
      params: { page, limit, ...(search ? { search } : {}) },
    });
    return response.data;
  },

  /** Flat rows plus the column order; the XLSX is built client-side. */
  export: async (eventId: string): Promise<EventFeedbackExportResponse> => {
    const response = await PrivateAxios.get(
      `${BASE}/feedback/admin/${eventId}/export`,
    );
    return response.data.data;
  },

  /**
   * Opens or closes the feedback window.
   *
   * Also gates self-registration, which auto-approves whoever uses it — so this
   * is the switch that decides whether the public link can add approved guests.
   */
  toggleAcceptResponse: async (
    eventId: string,
    canAcceptResponse: boolean,
  ): Promise<{ id: string; canAcceptResponse: boolean }> => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/events/${eventId}/toggle-response`,
      { canAcceptResponse },
    );
    return response.data.data;
  },

  /** Merges — posting one switch must not blank the others. */
  updateSettings: async (
    eventId: string,
    settings: Partial<EventSettings>,
  ): Promise<EventSettings> => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/events/${eventId}/settings`,
      settings,
    );
    return response.data.data;
  },
};
