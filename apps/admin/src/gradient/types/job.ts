import { IPaginationMeta } from "./pagination";

export interface Job {
  id: string;
  companyName: string;
  companyLogo: string | null;
  applicantsCount: string;
  employmentType: string;
  seniorityLevel: string;
  jobFunction: string;
  industries: string;
  title: string;
  location: string;
  postedAt: string | null;
  applyUrl: string;
  link: string;
  uploadedBy: string;
  jobType: string;
  jobSource: string;
  descriptionHtml?: string;
  companyDescription?: string;
  companyWebsite?: string;
}

export interface JobFilters {
  page?: number;
  limit?: number;
  employmentType?: string;
  seniorityLevel?: string;
  location?: string;
  jobType?: string;
  companyName?: string;
  jobSource?: string;
}

export interface JobResponse {
  success: boolean;
  data: Job[];
  meta: IPaginationMeta;
}

export type CreateJobPayload = {
  jobType: string;
  title: string;
  location: string;
  descriptionHtml: string;
  employmentType: "Full-time" | "Contract" | "Volunteer" | "Internship";
  seniorityLevel:string;
  companyName: string;
  companyLogo: string;
  companyDescription: string;
  companyWebsite: string;
};
