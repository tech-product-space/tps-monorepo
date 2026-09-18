import { PrivateAxios } from "@/helpers/PrivateAxios";

export interface ICertificateTemplate {
  certificateName: string;
  imageSize: string;
  fields: any[];
  templateImage: string;
}

interface SaveCertificateTemplatePayload extends ICertificateTemplate {
  courseId: string;
}


interface EventCertificateEmailResponse {
  id: string;
  courseId: any;
  certificateName: string;
  emailSubject: string;
  emailBody: any;
}

export const getCourseCertificateTemplate = async (
  courseId: string,
): Promise<ICertificateTemplate> => {
  const response = await PrivateAxios.get(
    `/courses/${courseId}/certificate/template`,
  );
  return response.data.template;
};

export const saveCertificateTemplate = async (
  courseId: string,
  data: SaveCertificateTemplatePayload,
) => {
  const response = await PrivateAxios.post(
    `/courses/${courseId}/certificate/template`,
    data,
  );
  return response.data;
};

export const saveCertificateEmailTemplate = async (data: {
  courseId: any;
  emailSubject: string;
  emailBody: any;
}) => {
  const response = await PrivateAxios.post(
    `/courses/${data.courseId}/certificate/save-email-template`,
    {
      emailSubject: data.emailSubject,
      emailBody: data.emailBody,
    },
  );
  return response.data.data;
};

export const getEmailTemplateByCourseId = async (data: {
  courseId: any;
}): Promise<EventCertificateEmailResponse> => {
  const response = await PrivateAxios.get(
    `/courses/${data.courseId}/certificate/email-template`,
  );
  return response.data.data;
};

export const sendCertificateTestEmail = async (data: {
  courseId: number | string;
  email: string;
}) => {
  const response = await PrivateAxios.post(
    `/courses/${data.courseId}/certificate/send-test-email`,
    { email: data.email },
  );
  return response.data;
};
