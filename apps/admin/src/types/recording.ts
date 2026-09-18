import { IPaginationMeta } from "@/types/pagination";

export interface RecordingSpeaker {
  name: string;
  title?: string;
  company?: string;
  avatar?: string;
  bio?: string;
  linkedinUrl?: string;
  previouslyAt?: { name: string; logo?: string }[];
}

export interface RecordingHost {
  name?: string;
  avatar?: string;
  linkedinUrl?: string;
}

export interface RecordingVideo {
  provider?: string;
  url?: string;
  /** Parsed from `url` server-side. Never sent by the panel. */
  videoId?: string | null;
  isUnlisted?: boolean;
}

/**
 * The prose blocks. Keys must match the backend's `RECORDING_CONTENT_KEYS` —
 * anything else is dropped on write, deliberately, so the column cannot drift.
 * Adding a block means adding it here, to `CONTENT_BLOCKS`, and to the backend
 * constant; no migration.
 *
 * Every value is an **HTML string** from the rich-text editor.
 */
export interface RecordingContent {
  whatYouWillLearn?: string;
  whyThisMatters?: string;
  keyTakeaways?: string;
}

export interface RecordingSettings {
  gateVideo?: boolean;
  showAttendeeCount?: boolean;
  showKeepExploring?: boolean;
}

export interface RecordingSeo {
  title?: string;
  description?: string;
  ogImage?: string;
  keywords?: string[];
}

export interface RecordingCategory {
  id: string;
  name: string;
  slug: string;
  order: number;
  isActive: boolean;
  description?: string | null;
  /** Only on the admin list — the delete dialog cannot be honest without it. */
  recordingCount?: number;
}

export interface RecordingResponse {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  categoryId?: string | null;
  category?: Pick<RecordingCategory, "id" | "name" | "slug"> | null;
  thumbnail?: string | null;
  video?: RecordingVideo;
  durationMinutes?: number | null;
  host?: RecordingHost;
  speakers?: RecordingSpeaker[];
  content?: RecordingContent;
  relatedRecordingIds?: string[];
  attendeeCount?: number | null;
  /**
   * Distinct people who have unlocked this recording — **one per account, ever,
   * however many times they press play.** The same number as `leadCount`, kept
   * as a column so a listing does not need a join to show it.
   */
  viewCount: number;
  seo?: RecordingSeo;
  settings?: RecordingSettings;
  /** The badge. One of `RECORDING_FORMATS`. */
  format?: string | null;
  isPublished: boolean;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Distinct people. Counted from the lead rows rather than denormalised. */
  leadCount?: number;
}

/**
 * What the editor sends.
 *
 * The JSONB blocks are merged one key deep server-side, so **always send the
 * whole object**. Omitting `content.whatYouWillLearn` preserves what is stored —
 * which means an admin who deleted every bullet would watch them reappear on
 * save.
 */
export interface CreateRecordingPayload {
  title: string;
  slug?: string;
  subtitle?: string;
  categoryId?: string | null;
  thumbnail?: string | null;
  video?: { url?: string; isUnlisted?: boolean };
  durationMinutes?: number | null;
  host?: RecordingHost;
  speakers?: RecordingSpeaker[];
  content?: RecordingContent;
  relatedRecordingIds?: string[];
  attendeeCount?: number | null;
  format?: string | null;
  seo?: RecordingSeo;
  settings?: RecordingSettings;
  scheduledAt?: string | null;
}

/**
 * One person who passed the gate.
 *
 * Everything below `email` is optional on purpose: the gate can be asked to
 * collect more or less, and a lead captured by an earlier version of the form
 * has only what that version asked for. Two cases worth knowing about:
 *
 *   the student branch  `collegeName` and `graduationYear` are set only for a
 *                       Student, and `jobTitle` only for a Professional
 *   repeat passes       `submissionCount` counts them; there is still one row
 */
export interface RecordingLead {
  id: string;
  recordingId: string;
  email: string;
  submissionCount: number;
  lastSubmittedAt: string;
  createdAt: string;
  name?: string | null;
  phone?: string | null;
  countryCode?: string | null;
  /** The form's "Current role / company". */
  jobTitle?: string | null;
  attendeeType?: "Professional" | "Student" | null;
  /** Students only. */
  collegeName?: string | null;
  /** Students only. A 4-digit year, as a string. */
  graduationYear?: string | null;
  linkedinUrl?: string | null;
  additionalData?: Record<string, unknown>;
  recording?: { id: string; title: string; slug: string };
}

export interface RecordingListResponse {
  success: boolean;
  data: RecordingResponse[];
  meta: IPaginationMeta;
}

export interface RecordingLeadResponse {
  success: boolean;
  data: RecordingLead[];
  meta: IPaginationMeta;
}
