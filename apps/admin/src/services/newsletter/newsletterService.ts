import { PrivateAxios } from "@/helpers/PrivateAxios";

export interface Subscriber {
  id: number;
  email: string;
  status: "subscribed" | "unsubscribed";
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface SubscriberStats {
  total: number;
  subscribed: number;
  unsubscribed: number;
}

export interface SendResult {
  message: string;
  total: number;
  campaignId?: number | null;
}

export interface SendTestResult {
  message: string;
  sent: number;
  failed: number;
}

export interface NewsletterHistoryItem {
  id: number;
  subject: string;
  senderEmail: string | null;
  senderName: string | null;
  body: string | null;
  audienceType: string | null;
  audienceFrom: string | null;
  audienceTo: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  status: string;
  createdAt: string;
}

export type NewsletterAudience =
  | { type: "all" }
  | { type: "date"; from?: string; to?: string }
  | { type: "selected"; emails: string[] };

export interface SendNewsletterPayload {
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
  audience?: NewsletterAudience;
}

export interface SendTestPayload {
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
  email: string;
}

// Senders that the backend (service/mail/sendEmail.js) is configured to send from.
export const NEWSLETTER_SENDERS = [
  "info@theproductspace.in",
  "akhil@theproductspace.in",
  "noreply@theproductspace.in",
];

export interface SubscriberQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: "subscribed" | "unsubscribed";
  from?: string;
  to?: string;
}

// Paginated list -> { data, meta }
export const getSubscribers = async (
  params: SubscriberQuery
): Promise<{ data: Subscriber[]; meta: PaginationMeta }> => {
  const res = await PrivateAxios.get("/newsletter", { params });
  return res.data;
};

// Full list (no page) -> array. Used for export and date-range counting.
export const getAllSubscribers = async (
  params?: Omit<SubscriberQuery, "page" | "limit">
): Promise<Subscriber[]> => {
  const res = await PrivateAxios.get("/newsletter", { params });
  return res.data;
};

export const getSubscriberStats = async (): Promise<SubscriberStats> => {
  const res = await PrivateAxios.get("/newsletter/stats");
  return res.data;
};

export const deleteSubscriber = async (id: number) => {
  const res = await PrivateAxios.delete(`/newsletter/${id}`);
  return res.data;
};

export const sendNewsletter = async (
  payload: SendNewsletterPayload
): Promise<SendResult> => {
  const res = await PrivateAxios.post("/newsletter/send", payload);
  return res.data;
};

export const sendTestNewsletter = async (
  payload: SendTestPayload
): Promise<SendTestResult> => {
  const res = await PrivateAxios.post("/newsletter/send-test", payload);
  return res.data;
};

export const getNewsletterHistory = async (): Promise<NewsletterHistoryItem[]> => {
  const res = await PrivateAxios.get("/newsletter/history");
  return res.data;
};
