import { PrivateAxios, PrivateUploadAxios } from "@/helpers/PrivateAxios";
import Cookies from "js-cookie";

export type SupportStatus = "open" | "in_progress" | "closed";

export type SupportPriority = "low" | "normal" | "medium" | "high";

const ASSETS_BASE_URL = (
  process.env.NEXT_PUBLIC_AWS_FILE_BASE_URL || "https://assets.theproductspace.in"
).replace(/\/+$/, "");

// Attachment file_url is stored as a bucket-relative key (e.g.
// "support/01ABC-screenshot.png"); resolve it against the assets CDN domain.
export const resolveAttachmentUrl = (key: string): string =>
  `${ASSETS_BASE_URL}/${key.replace(/^\/+/, "")}`;

export interface SupportAttachment {
  id: string;
  ticket_id: string;
  message_id: string | null;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  uploaded_by_type: string | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_type: "user" | "staff" | "system";
  sender_user_id: number | null;
  sender_staff_id: number | null;
  body: string | null;
  type: string;
  is_internal: boolean;
  metadata?: Record<string, any> | null;
  createdAt: string;
  userAuthor?: { id: number; name: string; profile_picture?: string } | null;
  staffAuthor?: { id: number; name: string } | null;
  attachments?: SupportAttachment[];
}

export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: number;
  requester_name: string | null;
  requester_email: string | null;
  requester_phone: string | null;
  subject: string;
  category: string | null;
  description: string;
  status: SupportStatus;
  priority: SupportPriority;
  is_cohort_member: boolean;
  cohort_member_id: string | null;
  last_message_at: string | null;
  first_response_at: string | null;
  last_user_seen_at: string | null;
  closed_at: string | null;
  createdAt: string;
  requester?: {
    id: number;
    name: string;
    email: string;
    phone?: string | null;
    profile_picture?: string | null;
  } | null;
  cohortMember?: {
    id: string;
    course: string;
    cohort: string;
    status: string;
    role: string;
  } | null;
  messages?: SupportMessage[];
  attachments?: SupportAttachment[];
}

export interface SupportStats {
  total: number;
  open: number;
  cohortOpen: number;
  closedToday: number;
  statusCounts: Record<string, number>;
  priorityCounts: Record<string, number>;
}

export interface ListTicketsParams {
  status?: string; // comma-separated
  priority?: string;
  cohort?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

const authConfig = () => ({
  headers: { Authorization: `Bearer ${Cookies.get("admin_token") || ""}` },
});

export const listTickets = async (params: ListTicketsParams = {}) => {
  const res = await PrivateAxios.get(`/support/admin/tickets`, { params });
  return res.data as { data: SupportTicket[]; meta: any };
};

export const getStats = async () => {
  const res = await PrivateAxios.get(`/support/admin/stats`);
  return res.data as { data: SupportStats };
};

export const getTicket = async (id: string) => {
  const res = await PrivateAxios.get(`/support/admin/tickets/${id}`);
  return res.data as { data: SupportTicket };
};

export const addStaffMessage = async (
  id: string,
  body: string,
  isInternal: boolean,
  attachments?: File[]
) => {
  const fd = new FormData();
  if (body) fd.append("body", body);
  fd.append("is_internal", String(isInternal));
  (attachments || []).forEach((f) => fd.append("attachments", f));
  // PrivateUploadAxios has no auth interceptor — attach the token explicitly.
  const res = await PrivateUploadAxios.post(
    `/support/admin/tickets/${id}/messages`,
    fd,
    authConfig()
  );
  return res.data as { data: SupportTicket };
};

// Posts a user-visible prompt asking the requester for their phone number.
// Used when a ticket has no phone on file. Backend no-ops if one already exists.
export const requestPhone = async (id: string) => {
  const res = await PrivateAxios.post(`/support/admin/tickets/${id}/request-phone`);
  return res.data as { data: SupportTicket };
};

export const updateTicket = async (
  id: string,
  patch: {
    status?: SupportStatus;
    priority?: SupportPriority;
  }
) => {
  const res = await PrivateAxios.patch(`/support/admin/tickets/${id}`, patch);
  return res.data as { data: SupportTicket };
};

/* ------------------------------ presentation ------------------------------ */

export const STATUS_LABEL: Record<SupportStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  closed: "Closed",
};

export const STATUS_OPTIONS: SupportStatus[] = ["open", "in_progress", "closed"];

export const PRIORITY_OPTIONS: SupportPriority[] = [
  "low",
  "normal",
  "medium",
  "high",
];

export const PRIORITY_LABEL: Record<SupportPriority, string> = {
  low: "Low",
  normal: "Normal",
  medium: "Medium",
  high: "High",
};

export const DEFAULT_STATUSES: SupportStatus[] = ["open", "in_progress"];

export const STATUS_BADGE: Record<SupportStatus, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  closed: "bg-gray-200 text-gray-700",
};

export const PRIORITY_BADGE: Record<SupportPriority, string> = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-sky-100 text-sky-700",
  medium: "bg-orange-100 text-orange-700",
  high: "bg-red-100 text-red-700",
};

// Up-to-two-letter initials for avatars (e.g. "Jane Doe" -> "JD").
export function initials(name?: string | null) {
  if (!name) return "?";
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("") || "?"
  );
}

// Deterministic soft-tinted avatar colour derived from the name, so a given
// requester always gets the same swatch across the queue and the panel.
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
];

export function avatarColor(seed?: string | null) {
  const s = seed || "";
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function formatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Day-level key for grouping messages into date separators ("Today" / "Yesterday" / date).
export function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

export function formatDateSeparator(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
