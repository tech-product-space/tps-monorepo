import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import { cleanHtml } from "@/gradient/lib/cleanHtml";
import {
  EventResponse,
  CreateEventPayload,
  DuplicateEventPayload,
  EventRegistrationResponse,
  EventGuestStatusResponse,
  ReferralLeaderboardResponse,
  ReferralStats,
  ReferredGuest,
} from "@/gradient/types/event";

const EVENT_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/events`;

export const eventService = {
  // Admin Routes
  getAllEvents: async (): Promise<EventResponse[]> => {
    const response = await PrivateAxios.get(`${EVENT_BASE_URL}/admin/events`);
    return response.data.data;
  },

  getAllPastEvents: async (): Promise<EventResponse[]> => {
    const response = await PrivateAxios.get(`${EVENT_BASE_URL}/admin/past-events`);
    return response.data.data;
  },

  checkSlugAvailability: async (slug: string) => {
    const response = await PrivateAxios.get(
      `${EVENT_BASE_URL}/admin/slug-availability`,
      {
        params: { slug },
      },
    );
    return response.data;
  },

  createEvent: async (data: CreateEventPayload) => {
    const response = await PrivateAxios.post(
      `${EVENT_BASE_URL}/admin/create`,
      data,
    );
    return response.data.data;
  },

  getEventById: async (id: string): Promise<EventResponse> => {
    const response = await PrivateAxios.get(
      `${EVENT_BASE_URL}/admin/events/${id}`,
    );
    return response.data.data;
  },

  updateEvent: async (id: string, data: Partial<EventResponse>) => {
    const response = await PrivateAxios.put(
      `${EVENT_BASE_URL}/admin/events/${id}`,
      data,
    );
    return response.data.data;
  },

  duplicateEvent: async (
    id: string,
    data: DuplicateEventPayload,
  ): Promise<EventResponse> => {
    const response = await PrivateAxios.post(
      `${EVENT_BASE_URL}/admin/events/${id}/duplicate`,
      data,
    );
    return response.data.data;
  },

  toggleEventPublishStatus: async (id: string) => {
    const response = await PrivateAxios.patch(
      `${EVENT_BASE_URL}/admin/events/${id}/toggle-publish`,
    );
    return response.data.data;
  },

  deleteEvent: async (id: string) => {
    const response = await PrivateAxios.delete(
      `${EVENT_BASE_URL}/admin/events/${id}`,
    );
    return response.data;
  },

  getEventRegistrations: async (
    eventId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<EventRegistrationResponse> => {
    const response = await PrivateAxios.get(`${EVENT_BASE_URL}/guest`, {
      params: { eventId, page, limit },
    });
    return response.data;
  },

  bulkUpdateStatus: async (
    eventId: string,
    status: string,
    attendeeType?: string,
  ) => {
    const payload: any = { status };
    if (attendeeType && attendeeType !== "All") {
      payload.attendeeType = attendeeType;
    }
    const response = await PrivateAxios.patch(
      `${EVENT_BASE_URL}/guest/event/${eventId}/status/bulk`,
      payload,
    );
    return response.data;
  },

  updateGuestStatus: async (guestId: string, status: string) => {
    const response = await PrivateAxios.patch(
      `${EVENT_BASE_URL}/guest/${guestId}/status`,
      { status },
    );
    return response.data;
  },

  upsertTemplate: async (
    eventId: string,
    data: { type: string; subject: string; body: string },
  ) => {
    const cleanedBody = cleanHtml(data.body);

    const payload = {
      ...data,
      body: cleanedBody,
    };

    const response = await PrivateAxios.post(
      `${EVENT_BASE_URL}/email/${eventId}/template`,
      payload,
    );

    return response.data;
  },

  getTemplate: async (eventId: string, type: string) => {
    const response = await PrivateAxios.get(
      `${EVENT_BASE_URL}/email/${eventId}/template`,
      { params: { type } },
    );
    return response.data;
  },

  /**
   * Sends what is currently in the editor, saved or not — the subject and body
   * travel in the request rather than being read from the row. Runs the body
   * through the same `cleanHtml` as `upsertTemplate` so the test renders what
   * saving would actually store.
   */
  sendTestTemplateEmail: async (
    eventId: string,
    data: {
      type: string;
      subject: string;
      body: string;
      to: string;
      recipientName?: string;
    },
  ) => {
    const response = await PrivateAxios.post(
      `${EVENT_BASE_URL}/email/${eventId}/template/test`,
      { ...data, body: cleanHtml(data.body) },
    );

    return response.data;
  },

  getOverallGuestStatus: async (eventId: string): Promise<EventGuestStatusResponse> => {
    const response = await PrivateAxios.get(
      `${EVENT_BASE_URL}/guest/event/${eventId}/guest-status`,
    );
    return response.data;
  },

  /* ── Referrals ───────────────────────────────────────────────────────── */

  getReferralLeaderboard: async (
    eventId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<ReferralLeaderboardResponse> => {
    const response = await PrivateAxios.get(
      `${EVENT_BASE_URL}/guest/referral/leaderboard`,
      { params: { eventId, page, limit } },
    );
    return response.data;
  },

  getReferralStats: async (eventId: string): Promise<{ data: ReferralStats }> => {
    const response = await PrivateAxios.get(
      `${EVENT_BASE_URL}/guest/referral/stats`,
      { params: { eventId } },
    );
    return response.data;
  },

  getReferees: async (
    eventId: string,
    referrerUserId: string,
  ): Promise<{ data: ReferredGuest[] }> => {
    const response = await PrivateAxios.get(
      `${EVENT_BASE_URL}/guest/referral/referees`,
      { params: { eventId, referrerUserId } },
    );
    return response.data;
  },

  /**
   * Approve every waitlisted guest who referred at least `minReferrals` people.
   * `dryRun` returns the affected count without applying anything — used to
   * preview the action, since the table only holds one page at a time.
   */
  bulkApproveByReferralCount: async (
    eventId: string,
    minReferrals: number,
    dryRun: boolean = false,
  ): Promise<{ message: string; updatedCount: number; affectedCount: number }> => {
    const response = await PrivateAxios.patch(
      `${EVENT_BASE_URL}/guest/event/${eventId}/referral/bulk-approve`,
      { minReferrals, dryRun },
    );
    return response.data;
  },
};
