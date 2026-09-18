export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "converted"
  | "rejected"
  | "duplicate";

export interface Lead {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    countryCode?: string;

    source: string;
    sourceDisplayName?: string;

    subSource?: string;
    subSourceDisplayName?: string;

    status: LeadStatus;

    pageUrl?: string;
    referrer?: string;

    utmId?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;

    additionalData?: Record<string, any>;

    createdAt: string;
}