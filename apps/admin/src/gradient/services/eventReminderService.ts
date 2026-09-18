import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import { cleanHtml } from "@/gradient/lib/cleanHtml";

const RESOURCE_BASE_URL = "/events/reminders";

export type ReminderPayload = {
  eventId: string;
  name: string;
  subject: string;
  body: string;
  senderEmail: string;
  targetStatus?: string;
  targetAttendeeType?: string;
};

export type ReminderFilters = {
  eventId?: string;
  status?: string;
};

const reminderService = {
  createReminder: async (payload: ReminderPayload) => {
    const sanitizedPayload = {
      ...payload,
      body: cleanHtml(payload.body),
    };

    const response = await PrivateAxios.post(
      RESOURCE_BASE_URL,
      sanitizedPayload,
    );
    return response.data;
  },

  listReminders: async (filters?: ReminderFilters) => {
    const response = await PrivateAxios.get(RESOURCE_BASE_URL, {
      params: filters,
    });
    return response.data;
  },

  updateReminder: async (id: string, payload: Partial<ReminderPayload>) => {
    const sanitizedPayload = {
      ...payload,
      ...(payload.body && { body: cleanHtml(payload.body) }),
    };

    const response = await PrivateAxios.put(
      `${RESOURCE_BASE_URL}/${id}`,
      sanitizedPayload,
    );
    return response.data;
  },

  removeReminder: async (id: string) => {
    const response = await PrivateAxios.delete(`${RESOURCE_BASE_URL}/${id}`);
    return response.data;
  },

  scheduleReminder: async (id: string, scheduledAt: string) => {
    const response = await PrivateAxios.post(
      `${RESOURCE_BASE_URL}/${id}/schedule`,
      { scheduledAt },
    );
    return response.data;
  },

  cancelReminder: async (id: string) => {
    const response = await PrivateAxios.post(
      `${RESOURCE_BASE_URL}/${id}/cancel`,
    );
    return response.data;
  },

  sendReminderNow: async (id: string) => {
    const response = await PrivateAxios.post(
      `${RESOURCE_BASE_URL}/${id}/send-now`,
    );
    return response.data;
  },

  sendTestEmail: async (
    id: string,
    data: { recipientName: string; to: string },
  ) => {
    const response = await PrivateAxios.post(
      `${RESOURCE_BASE_URL}/${id}/send-test-email`,
      data,
    );
    return response.data;
  },
};

export default reminderService;
