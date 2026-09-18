import { PrivateAxios } from "@/helpers/PrivateAxios";

interface ReminderEmailPayload {
  templateName: string;
  subject: string;
  body: string;
  targetGuestType: string;
  targetGuestRole: string;
  scheduledAt: string;
}

export const createEmailTemplate = async (
  eventId: string,
  data: ReminderEmailPayload,
) => {
  const response = await PrivateAxios.post(
    `/events/${eventId}/email/template`,
    data,
  );
  return response.data;
};

export const getEmailTemplates = async (eventId: string) => {
  const response = await PrivateAxios.get(`/events/${eventId}/email/templates`);
  return response.data;
};

export const getEmailTemplateById = async (templateId: string) => {
  const response = await PrivateAxios.get(
    `/events/email/template/${templateId}`,
  );
  return response.data;
};

export const updateEmailTemplateV2 = async (
  templateId: string,
  data: ReminderEmailPayload,
) => {
  const response = await PrivateAxios.put(
    `/events/email/template/${templateId}`,
    data,
  );
  return response.data;
};

export const deleteEmailTemplateV2 = async (templateId: string) => {
  const response = await PrivateAxios.delete(
    `/events/email/template/${templateId}`,
  );
  return response.data;
};

export const scheduleEmailTemplate = async (
  templateId: string,
  scheduledAt: string,
) => {
  const response = await PrivateAxios.post(
    `/events/email/template/${templateId}/schedule`,
    { scheduledAt },
  );
  return response.data;
};

export const cancelEmailTemplateSchedule = async (templateId: string) => {
  const response = await PrivateAxios.post(
    `/events/email/template/${templateId}/cancel`,
  );
  return response.data;
};

export const sendTestEmailTemplate = async (
  templateId: string,
  data: { email: string; name: string },
) => {
  const response = await PrivateAxios.post(
    `/events/email/template/${templateId}/test`,
    data,
  );
  return response.data;
};


export const sendReminderEmailNow = async (
  templateId: string,
) => {
  const response = await PrivateAxios.post(
    `/events/email/template/sendEmailNow`,
    {templateId}
  );
  return response.data;
};
