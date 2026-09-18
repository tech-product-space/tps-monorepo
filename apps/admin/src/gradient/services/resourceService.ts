import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import { cleanHtml } from "@/gradient/lib/cleanHtml";
import { CreateResourcePayload, ResourceLeadResponse } from "@/gradient/types/resource";

const RESOURCE_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/resources`;

type EmailTemplate = {
  subject: string;
  body: string;
};

export const resourceService = {
  // Admin Routes
  getAllResources: async () => {
    const response = await PrivateAxios.get(
      `${RESOURCE_BASE_URL}/admin/resources`,
    );
    return response.data;
  },

  checkSlugAvailability: async (slug: string) => {
    const response = await PrivateAxios.get(
      `${RESOURCE_BASE_URL}/admin/slug-availability`,
      {
        params: { slug },
      },
    );
    return response.data;
  },

  createResource: async (data: CreateResourcePayload) => {
    const response = await PrivateAxios.post(
      `${RESOURCE_BASE_URL}/admin/create`,
      data,
    );
    return response.data;
  },

  getResourceById: async (id: string) => {
    const response = await PrivateAxios.get(
      `${RESOURCE_BASE_URL}/admin/resources/${id}`,
    );
    return response.data;
  },

  updateResource: async (id: string, data: Partial<CreateResourcePayload>) => {
    const response = await PrivateAxios.put(
      `${RESOURCE_BASE_URL}/admin/resources/${id}`,
      data,
    );
    return response.data;
  },

  toggleResourceStatus: async (id: string) => {
    const response = await PrivateAxios.patch(
      `${RESOURCE_BASE_URL}/admin/resources/${id}/toggle-status`,
    );
    return response.data;
  },

  deleteResource: async (id: string) => {
    const response = await PrivateAxios.delete(
      `${RESOURCE_BASE_URL}/admin/resources/${id}`,
    );
    return response.data;
  },

  updateEmailTemplate: async (id: string, emailTemplate: EmailTemplate) => {
    const cleanedBody = cleanHtml(emailTemplate.body);

    const payload = {
      emailTemplate: {
        subject: emailTemplate.subject,
        body: cleanedBody,
      },
    };

    const response = await PrivateAxios.put(
      `${RESOURCE_BASE_URL}/${id}/email-template`,
      payload,
    );

    return response.data;
  },
  
  getResourceDownloads: async (
    resourceId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<ResourceLeadResponse> => {
    const response = await PrivateAxios.get(`${RESOURCE_BASE_URL}/leads`, {
      params: { resourceId, page, limit },
    });
    return response.data;
  },
};
