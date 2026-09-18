import { PrivateAxios } from "@/helpers/PrivateAxios";

export interface ICertificateTemplate {
  certificateName: string;
  imageSize: string;
  fields: any[];
  templateImage: string;
}

interface SaveCertificateTemplatePayload extends ICertificateTemplate {
  eventId: string;
}

interface GenerateCertificateResponse {
  certificateGenerated: boolean;
  certificateId: string;
  certificateName: string;
  certificateGeneratedAt: string;
  certificateUrl: string;
}

interface EventCertificateEmailResponse {
  id: string;
  eventId: any;
  certificateName: string;
  emailSubject: string;
  emailBody: any;
}

export const getEventCertificateTemplate = async (
  eventId: string,
): Promise<ICertificateTemplate> => {
  const response = await PrivateAxios.get(`/events/certificate/${eventId}`);
  return response.data.template;
};

export const saveCertificateTemplate = async (
  data: SaveCertificateTemplatePayload,
) => {
  const response = await PrivateAxios.post(`/events/certificate/save`, data);
  return response.data;
};

export const approveCertificate = async (guestId: string) => {
  const response = await PrivateAxios.put(`/events/certificate/approve`, {
    guestId,
  });
  return response.data;
};

export const generateCertificate = async (data: {
  userId: string;
  eventId: string;
}): Promise<GenerateCertificateResponse> => {
  const response = await PrivateAxios.post(
    `/events/certificate/generate`,
    data,
  );
  return response.data.data;
};

export const saveCertificateEmailTemplate = async (data: {
  eventId: any;
  emailSubject: string;
  emailBody: any;
}) => {
  const response = await PrivateAxios.post(
    `/events/certificate/save-email-template`,
    data,
  );
  return response.data.data;
};

export const getEmailTemplateByEvent = async (data: {
  eventId: any;
}): Promise<EventCertificateEmailResponse> => {
  const response = await PrivateAxios.get(
    `/events/certificate//email-template/${data.eventId}`,
  );
  return response.data.data;
};

export const sendCertificateTestEmail = async (data: {
  eventId: number | string;
  email: string;
}) => {
  const response = await PrivateAxios.post(
    `/events/send-certificate-test-email`,
    data,
  );
  return response.data;
};

export const bulkApproveCertificate = async (eventId: number) => {
  const response = await PrivateAxios.put(
    "/events/certificate/bulk-approve",
    { eventId },
  );
  return response.data;
};

export const bulkGenerateCertificates = async (eventId: number) => {
  const response = await PrivateAxios.post(
    "/events/certificate/bulk-generate",
    { eventId },
  );
  return response.data;
};
