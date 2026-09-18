import { IPaginationMeta } from "./pagination";

export interface ResourceMeta {
  metaTitle?: string;
  metaDesc?: string;
}

export interface AuthorDetail {
  name: string;
  company: string;
  designation: string;
  authorBio: string;
  imageKey: string;
}

export interface EmailTemplate {
  subject: string;
  body: string;
}

export interface ResourceDetails {
  type: string;
  pdfLink?: string;
  description?: Record<string, unknown> | null;
}

export interface ResourceResponse {
  id: string;
  resourceType?: string;
  title?: string;
  subtitle?: string;
  thumbnailSrc?: string;
  resourceCategory?: string;
  tagPrimary?: string[];
  tagSecondary?: string[];
  resourceContent?: any;
  emailTemplate?: EmailTemplate;
  resourceSlug: string;
  authorDetails?: AuthorDetail[];
  seo?: ResourceMeta;
  resourceDetails?: ResourceDetails;
  scheduledAt?: string | null;
  additionalDetails?: any;
  isPublished: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateResourcePayload {
  resourceType?: string;
  title?: string;
  subtitle?: string;
  thumbnailSrc?: string;
  resourceCategory?: string;
  tagPrimary?: string[];
  tagSecondary?: string[];
  resourceContent?: any;
  emailTemplate?: EmailTemplate;
  resourceSlug: string;
  authorDetails?: AuthorDetail[];
  seo?: ResourceMeta;
  resourceDetails?: ResourceDetails;
  scheduledAt?: string | null;
  additionalDetails?: any;
  isPublished?: boolean;
}
export interface ResourceLead {
  id: string;
  resourceId: string;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  additionalData: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceLeadResponse {
  data: ResourceLead[];
  meta: IPaginationMeta;
}
