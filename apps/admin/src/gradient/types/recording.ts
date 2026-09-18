import { IPaginationMeta } from "./pagination";

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
 */
/**
 * Every block is an **HTML string** from the rich-text editor.
 *
 * `whatYouWillLearn` was once `[{ title, description }]`; a migration converted
 * the stored rows to HTML lists, and `ContentSection` still coerces an array
 * defensively in case an old draft turns up.
 */
export interface RecordingContent {
  whatYouWillLearn?: string;
  whyThisMatters?: string;
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
   * Gate passes, and **not the number the panel shows** — nothing renders it.
   *
   * It tracked repeats meaningfully only while the gate reappeared on every
   * device; the per-account unlock ended that, so it now moves with
   * `leadCount` on anything recent while carrying historical inflation on older
   * rows. Kept as the record of what happened under the old behaviour.
   *
   * The viewing number is `leadCount` — see below.
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
  /**
   * Distinct people who watched — the number the panel shows as **Views**.
   *
   * One `RecordingLeads` row per (recording, person), so ten plays across four
   * devices is one. Named for the table it counts, rendered for what it means.
   */
  leadCount?: number;
}

/**
 * What the editor sends.
 *
 * The JSONB blocks are merged one key deep server-side, so **always send the
 * whole object**. Omitting `content.whatYouWillLearn` preserves the stored
 * array — which means an admin who deleted every bullet would watch them
 * reappear on save.
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
 * The gate collects the same details as the event join form — it renders
 * `EventDetailsForm` — so everything below is genuinely filled in, apart from
 * two cases worth knowing about:
 *
 *   pre-form rows      leads captured while the gate asked only for an email
 *                      have nothing but `email`, and cannot be backfilled
 *   the student branch `collegeName` and `graduationYear` are set only for a
 *                      Student, and `jobTitle` only for a Professional
 *
 * `jobTitle` is the form's "Current role / company" — the API stores the field
 * it posts as `role` in this column, since they are the same fact.
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
  /** The form's "Current role / company". Professionals only. */
  jobTitle?: string | null;
  attendeeType?: "Professional" | "Student" | null;
  /** Students only. */
  collegeName?: string | null;
  /** Students only. A 4-digit year, as a string. */
  graduationYear?: string | null;
  linkedinUrl?: string | null;
  /**
   * `"form"` — this person filled the gate for this recording.
   * `"carried"` — they clicked play on it and their details were copied from an
   * earlier recording. Both are real leads; only one is a fresh answer.
   */
  source?: "form" | "carried";
  /**
   * When a human last typed or confirmed these details — which for a carried
   * row is older than `createdAt`, often by weeks. That is the point of it.
   */
  detailsConfirmedAt?: string | null;
  /** The account that watched. Null only on rows predating the login gate. */
  userId?: string | null;
  additionalData?: Record<string, unknown>;
  recording?: { id: string; title: string; slug: string };
}

export interface RecordingLeadResponse {
  success: boolean;
  data: RecordingLead[];
  meta: IPaginationMeta;
}
