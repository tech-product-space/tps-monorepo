export const EVENT_EMAIL_TARGET_TYPES = {
  ALL: "All",
  APPROVED: "Approved",
  WAITLIST: "Waitlist",
  DECLINED: "Declined",
} as const;

export const EVENT_EMAIL_TARGET_ROLES ={
  ALL: "All",
  PROFESSIONAL: "Professional",
  STUDENT: "Student",
} as const;

export const EVENT_EMAIL_TEMPLATE_STATUS = {
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  SENT: "sent",
  FAILED: "failed",
} as const;

export interface EventEmailTemplate { 
  id: number;
  eventId: number;
  templateName: string;
  subject: string;
  body: string;
  targetGuestType: string;
  targetGuestRole:string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}
