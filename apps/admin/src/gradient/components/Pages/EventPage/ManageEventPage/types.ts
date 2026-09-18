import { ReminderPayload } from "@/gradient/services/eventReminderService";

export type Reminder = ReminderPayload & {
  id: string;
  createdAt: string;
  scheduledAt?: string | null;
  status?: string;
  sentAt?: string | null;
  totalSent?: number;
  totalFailed?: number;
  createdAdmin?: { id: string; name: string; email: string };
};

/**
 * `<input type="datetime-local">` reads and writes *local* time, so the value
 * has to be built from the local parts. `toISOString().slice(0, 16)` is UTC —
 * prefilling with it shifted every existing schedule back by the UTC offset
 * (5h30m here) the moment an admin reopened the dialog and pressed confirm.
 */
export const toDateTimeLocalValue = (value?: string | number | Date | null) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
};

export const EMPTY_FORM: ReminderPayload = {
  eventId: "",
  name: "",
  subject: "",
  body: "",
  senderEmail: "",
  targetStatus: "",
  targetAttendeeType: "",
};

export const STATUS_BADGE: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  pending: { label: "Pending", variant: "secondary" },
  scheduled: { label: "Scheduled", variant: "default" },
  processing: { label: "Processing", variant: "outline" },
  sent: { label: "Sent", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
};