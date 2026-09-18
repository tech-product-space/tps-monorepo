import { PrivateAxios } from "@/helpers/PrivateAxios";

export interface IEventGuest {
  eventId: string;
}

export interface IEventGuestStatus {
  userIds: number[];
  status: string;
  eventId: number;
}

export interface IEmailNotification {
  type: string;
  userIds: number[];
  eventId: number;
}

export interface EmailReminderPayload2 {
  eventId: string;
  reminderType: string;
  guestType: string;
}

export interface postEmailTempateForJoinEventInterface {
  eventId: string;
  type: string;
  date: string;
  startTime: string;
  endTime: string;
  subject: string;
  body: string;
}
export interface getEmailTemaplateForJoinEvnet {
  eventId: string;
  type: string;
}

export const getAllEvents = async () => {
  const response = await PrivateAxios.get(`/events`);
  return response.data;
};

export const getAllGuests = async (requestBody: IEventGuest) => {
  const response = await PrivateAxios.post(`/events/guests/by-id`, requestBody);
  return response.data;
};

export const eventGuestStatus = async (requestBody: IEventGuestStatus) => {
  const response = await PrivateAxios.post(
    `/events/approve-guests`,
    requestBody
  );
  return response.data;
};

export const createEvents = async (eventData: any) => {
  const response = await PrivateAxios.post(`/events/create`, eventData);
  return response.data;
};

export const updateEvents = async (id: string, eventData: any) => {
  const response = await PrivateAxios.put(`/events/${id}`, eventData);
  return response.data;
};

export const deleteEvents = async (id: string) => {
  const response = await PrivateAxios.delete(`/events/${id}`);
  return response.data;
};

export interface DuplicateEventPayload {
  eventTitle: string;
  eventSlug: string;
  eventStartDate: string;
  eventEndDate: string;
  eventStartTime?: string;
  eventEndTime?: string;
  isPublished: boolean;
}

export const duplicateEvent = async (
  id: string,
  payload: DuplicateEventPayload
) => {
  const response = await PrivateAxios.post(`/events/${id}/duplicate`, payload);
  return response.data;
};

export const updateEventPublishStatus = async (
  id: string,
  isPublished: boolean
) => {
  const response = await PrivateAxios.post(`/events/${id}/publish`, {
    isPublished,
  });
  return response.data;
};

export const updateEmailTemplate = async (id: string, data: any) => {
  const response = await PrivateAxios.post(
    `/events/${id}/email-template`,
    data
  );
  return response.data;
};

export const getEventById = async (id: string) => {
  const response = await PrivateAxios.get(`/events/${id}`);
  return response.data;
};

export const uploadEventImage = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await PrivateAxios.post("/upload/events", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const deleteEventFile = async (key: string) => {
  const response = await PrivateAxios.delete(`upload/events`, {
    data: { key },
  });
  return response.data;
};

export const getEmailTemplate = async (id: string, emailType: string) => {
  const response = await PrivateAxios.post(`/events/${id}/${emailType}`);
  return response.data;
};

export const sendEmailNotification = async (
  requestBody: IEmailNotification
): Promise<any> => {
  const response = await PrivateAxios.post(`/email/test`, requestBody);
  return response.data;
};

export const getPastEvents = async () => {
  const response = await PrivateAxios.get(`/past-events`);
  return response.data;
};

export const getEventReferals = async (id: any) => {
  const response = await PrivateAxios.get(
    `/events/referrals/with-referees?eventId=${id}`
  );
  return response.data;
};

export const getEventReferalsDetails = async (
  eventId: any,
  referralCode: string
) => {
  const response = await PrivateAxios.post(`/events/referrals/by-code`, {
    eventId,
    referralCode,
  });
  return response.data;
};

export const postEmailTempateForJoinEvent = async (
  payload: postEmailTempateForJoinEventInterface
) => {
  const response = await PrivateAxios.post(`/events/save-email`, payload);
  return response.data;
};

export const getEmailTempateForJoinEvent = async (
  payload: getEmailTemaplateForJoinEvnet
) => {
  const response = await PrivateAxios.post(`/events/get-email`, payload);
  return response.data;
};

export const checkSlugAvailability = async (slug: string) => {
  const response = await PrivateAxios.get(`/events/slug-availability`, {
    params: { slug },
  });
  return response.data;
};


export const toggleEventAcceptResponse = async (eventId: any, payload: {canAcceptResponse: boolean}) => {
  const response = await PrivateAxios.patch(
    `/events/${eventId}/toggle-response`,
    payload
  );
  return response.data;
};

