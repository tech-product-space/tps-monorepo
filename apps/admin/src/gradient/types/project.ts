import { IPaginationMeta } from "./pagination";

/**
 * Mirrors `PROJECT_LEVEL` in the backend constants.
 *
 * **Lowercase slugs, not display labels** — the label lives in
 * `PROJECT_LEVEL_LABELS` below. A level in a URL (`?level=beginner`) and a level
 * in the database have to be the same string.
 */
export type ProjectLevel = "beginner" | "intermediate" | "advanced";

export const PROJECT_LEVELS: ProjectLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
];

export const PROJECT_LEVEL_LABELS: Record<ProjectLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/**
 * Moderation state — *is this ours to show at all?*
 *
 * Not the same question as `isPublished` (*have we chosen to show it?*).
 * Approving does not publish. A public read needs both.
 */
export type ProjectStatus = "submitted" | "approved" | "rejected";

/** Who wrote the row. Drives the "Community" credit badge. */
export type ProjectSource = "admin" | "community";

export interface ProjectSettings {
  gateDownload?: boolean;
  /** Everything past `freeGuideSteps` sits behind the same form. */
  gateGuide?: boolean;
  /** How many steps read free. At least 1 — the API clamps it. */
  freeGuideSteps?: number;
  trackProgress?: boolean;
}

export interface ProjectSubmitter {
  name?: string;
  email?: string;
  phone?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  note?: string | null;
}

export interface ProjectCategory {
  id: string;
  name: string;
  slug: string;
  /**
   * **The whole tile** on the public hub, as an S3 key — not a logo. The name,
   * the sub-label and the arrow are baked into the artwork, so the site renders
   * this image and draws nothing over it. 16:9.
   */
  thumbnail?: string | null;
  description?: string | null;
  order: number;
  isActive: boolean;
  /** Computed server-side; not a column. */
  projectCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  categoryId?: string | null;
  category?: Pick<ProjectCategory, "id" | "name" | "slug"> | null;
  level?: ProjectLevel | null;
  prerequisites: string[];
  skills: string[];
  downloadUrl?: string | null;
  thumbnail?: string | null;
  relatedProjectIds: string[];
  seo?: Record<string, unknown>;
  settings?: ProjectSettings;
  status: ProjectStatus;
  source: ProjectSource;
  submitter?: ProjectSubmitter;
  /**
   * The submitter's **own** write-up — a README, a blog post, a walkthrough.
   * Reference material for whoever authors the guide; never the guide itself,
   * and never shown to the public.
   */
  submittedGuideUrl?: string | null;
  reviewedAt?: string | null;
  reviewedByAdminId?: string | null;
  rejectionReason?: string | null;
  /**
   * Gate passes. **Do not render this.** The number to show is `leadCount` —
   * people, not clicks. See the backend model.
   */
  downloadCount: number;
  isPublished: boolean;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  createdAt: string;
  updatedAt: string;

  /** Computed server-side. People who downloaded — the number the panel shows. */
  leadCount?: number;
  /** Computed server-side. How many guide steps exist. */
  stepCount?: number;
}

/** One step of the guide. `content` is TiptapEditor ProseMirror JSON. */
export interface ProjectStep {
  id: string;
  projectId: string;
  title: string;
  slug: string;
  order: number;
  content?: Record<string, unknown>;
  isPublished: boolean;
  seo?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLead {
  id: string;
  projectId: string;
  userId?: string | null;
  name: string;
  email: string;
  phone: string;
  countryCode?: string | null;
  source: "form" | "carried";
  /** Which door they came through. Both null is not possible in new rows. */
  guideUnlockedAt?: string | null;
  downloadedAt?: string | null;
  submissionCount: number;
  lastSubmittedAt: string;
  detailsConfirmedAt: string;
  createdAt: string;
  project?: Pick<Project, "id" | "title" | "slug">;
}

export type ProjectEmailType = "downloadDelivery" | "submissionAck";

export interface ProjectEmailTemplate {
  id: string;
  /** `null` means this row *is* the global default. */
  projectId: string | null;
  type: ProjectEmailType;
  subject: string;
  body: string;
  isEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * The per-project email view returns all three, so the screen can show
 * "inheriting the global" vs "overridden here" without reimplementing the
 * resolution rule in TypeScript.
 */
export interface ProjectEmailResolution {
  override: ProjectEmailTemplate | null;
  global: ProjectEmailTemplate | null;
  effective: ProjectEmailTemplate | null;
  inheritedFromGlobal: boolean | null;
  mergeFields: string[];
}

export interface CreateProjectPayload {
  title: string;
  slug?: string;
  summary?: string;
  categoryId: string;
  level?: ProjectLevel | null;
  prerequisites?: string[];
  skills?: string[];
  downloadUrl?: string;
  thumbnail?: string;
  relatedProjectIds?: string[];
  seo?: Record<string, unknown>;
  settings?: ProjectSettings;
  scheduledAt?: string | null;
}

export interface ProjectListResponse {
  success: boolean;
  data: Project[];
  meta: IPaginationMeta;
}

export interface ProjectLeadResponse {
  success: boolean;
  data: ProjectLead[];
  meta: IPaginationMeta;
}
