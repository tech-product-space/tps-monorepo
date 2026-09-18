import { PrivateAxios } from "@/helpers/PrivateAxios";
export interface IResourceSection {
  heading: string;
  points: string[];
}

export interface IResourceDetails {
  section1?: IResourceSection;
  section2?: IResourceSection;
  description?: string;
  downloadCta?: string;
  detailThumbnail?: string;
}

export interface IEmailData {
  subject: string;
  body: string;
}

export interface IResourceCard {
  id: number;
  title: string;
  subtitle: string;
  resourceType: "Ebooks" | "Guides" | "Templates" | "AI Toolkit";
  resourceCategory: "AI" | "Product Management" | "Software Development";
  tagPrimary: string[];
  tagSecondary?: string[];
  thumbnail: string;
  resourceDetails?: IResourceDetails;
  emailTemplate?: IEmailData;
  isPublished?: boolean;
}

export const createResource = async (eventData: any) => {
  const response = await PrivateAxios.post(`/resources`, eventData);
  return response.data;
};

export const getAllResources = async () => {
  const response = await PrivateAxios.get(`/resources/all-resources`);
  return response.data;
};

export const getResourcesById = async (id: any) => {
  const response = await PrivateAxios.get(`/resources/${id}`);
  return response.data;
};

export const resourcePublishStatus = async (id: any, isPublished: boolean) => {
  const response = await PrivateAxios.patch(`/resources/${id}/publish`, {
    isPublished,
  });
  return response.data;
};

export const getIndividualResourceLeads = async (id: any) => {
  const response = await PrivateAxios.get(`/resources/${id}/leads`);
  return response.data;
};

export const getAllLeads = async() => {
  const response = await PrivateAxios.get('/resources/allleads')
  return response.data
}

export const deleteResource = async (id: string) => {
  const response = await PrivateAxios.delete(`/resources/${id}`);
  return response.data;
};

export const getAllSubscribers = async() => {
  const response = await PrivateAxios.get('/newsletter')
  return response.data
}

export const checkResourceSlugAvailability = async (slug: string, excludeId='') => {
  const response = await PrivateAxios.get(`/resources/slug-availability`, {
    params: { slug, excludeId },
  });
  return response.data;
};