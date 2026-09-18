export type CampaignType = "email";

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent";

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  sender_email: string;
  sender_name: string;
  recipient_filters: any;
  subject: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface UnsubscribedUser {
  id: string;
  email: string;
  reason: string;
  createdAt: string;
  // Source-row context — populated when the opt-out was recorded against a
  // known lead row (workflow path, or campaign path whose email matched a
  // backfilled source row). Null for pure email-only opt-outs.
  lead_source_type: string | null;
  lead_source_id: string | null;
}