/**
 * Free course certificates — the parts specific to completing a course.
 *
 * The shared half (fonts, weights, geometry, field/template shapes) lives in
 * `certificate.ts`.
 */

export * from "./certificate";

import type {
  CertificateField,
  CertificateStatus,
  CertificateTemplateBase,
} from "./certificate";

/**
 * Placeholders a course template can position.
 *
 * `courseTitle`, not the event catalogue's `eventTitle`. A template stores its
 * field keys in JSONB, and an admin designing a course certificate should not
 * be offered a placeholder labelled "Event title" — while a template that
 * somehow carries `eventTitle` gets caught by the renderer's unknown-key
 * warning instead of rendering blank.
 */
export type FreeCourseCertificateFieldKey =
  | "recipientName"
  | "issuedDate"
  | "certificateNo"
  | "courseTitle";

export const FREE_COURSE_CERTIFICATE_FIELD_KEYS: FreeCourseCertificateFieldKey[] =
  ["recipientName", "issuedDate", "certificateNo", "courseTitle"];

export const FREE_COURSE_CERTIFICATE_FIELD_LABELS: Record<string, string> = {
  recipientName: "Recipient name",
  issuedDate: "Issue date",
  certificateNo: "Certificate number",
  courseTitle: "Course title",
};

/**
 * What each placeholder is drawn as on the editor canvas. Same values the
 * preview endpoint uses (PREVIEW_DATA in the render service) — deliberately
 * awkward, so an over-tight `maxWidth` shows up while designing rather than
 * after fifty certificates have gone out.
 */
export const FREE_COURSE_CERTIFICATE_SAMPLE_VALUES: Record<string, string> = {
  recipientName: "Priyadarshini Venkataraman",
  courseTitle: "Sample Course",
  issuedDate: "15 January 2026",
  certificateNo: "GRD-2026-PREVIEW1",
};

/** Where a placeholder lands when first added, and what it looks like. */
export const FREE_COURSE_CERTIFICATE_FIELD_DEFAULTS: Record<
  string,
  Omit<CertificateField, "key">
> = {
  recipientName: { x: 50, y: 46, fontSize: 64, color: "#111111", fontFamily: "Playfair Display", fontWeight: 700, align: "center", maxWidth: 70 },
  courseTitle: { x: 50, y: 60, fontSize: 28, color: "#444444", fontFamily: "Inter", fontWeight: 500, align: "center", maxWidth: 80 },
  issuedDate: { x: 25, y: 86, fontSize: 20, color: "#666666", fontFamily: "Inter", fontWeight: 400, align: "center" },
  certificateNo: { x: 75, y: 86, fontSize: 16, color: "#999999", fontFamily: "Roboto Mono", fontWeight: 400, align: "center" },
};

/** A course's design: the shared shape plus the course it belongs to. */
export interface FreeCourseCertificateTemplate extends CertificateTemplateBase {
  freeCourseId: string;
  fields: CertificateField[];
}

export type FreeCourseCertificateIssuedVia =
  | "Auto"
  | "Ensure"
  | "Admin"
  | "Correction";

/**
 * Can this course issue a certificate without an admin touching anything?
 *
 * Four checks, where the event version has two. A course can also have **no
 * published lessons**, in which case completion is unreachable and a banner
 * saying "ready" is lying — and a *disabled* email is as good as a missing one.
 */
export interface FreeCourseCertificateReadiness {
  autoIssueCertificate: boolean;
  hasTemplate: boolean;
  hasEmailTemplate: boolean;
  emailEnabled: boolean;
  hasPublishedLessons: boolean;
  publishedLessons: number;
  /**
   * How many learners already hold one. Not part of readiness — carried
   * alongside it so the panel can warn before publishing a lesson, which drops
   * every one of them below 100% while their certificates stay valid.
   */
  issuedCertificates: number;
  missing: ("template" | "email" | "emailDisabled" | "lessons")[];
  ready: boolean;
}

export interface FreeCourseCertificateRow {
  id: string;
  freeCourseId: string;
  userId: string;
  certificateNo: string;
  recipientName: string;
  recipientEmail: string;
  status: CertificateStatus;
  issuedVia: FreeCourseCertificateIssuedVia | null;
  fileKey: string | null;
  issuedAt: string | null;
  /** Separate from issuedAt: a PDF can exist while its email never landed. */
  emailSentAt: string | null;
  /** Published lessons when it was earned. Below today's count means drift. */
  lessonsAtIssue: number | null;
  attempts: number;
  lastError: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  replacesCertificateId: string | null;
  createdAt: string;
}

/**
 * A learner on the admin Learners tab.
 *
 * The list is the union of everyone currently at 100% and everyone who holds a
 * certificate — the second is not redundant, because a course that grew after
 * certificates went out leaves holders below 100%, and dropping them would hide
 * exactly the rows an admin goes looking for.
 */
export interface FreeCourseLearner {
  userId: string;
  name: string | null;
  email: string | null;
  enrolledAt: string | null;
  progress: { completed: number; total: number };
  /** True today. A holder below 100% is the drift case, not an error. */
  isComplete: boolean;
  certificate: Pick<
    FreeCourseCertificateRow,
    | "id"
    | "certificateNo"
    | "status"
    | "issuedVia"
    | "issuedAt"
    | "emailSentAt"
    | "lessonsAtIssue"
    | "lastError"
    | "recipientName"
    | "recipientEmail"
  > | null;
}

export interface FreeCourseLearnersResponse {
  /** Published lessons in the course right now. */
  total: number;
  learners: FreeCourseLearner[];
}

export interface FreeCourseEmailTemplate {
  id: string;
  freeCourseId: string;
  type: "CERTIFICATE";
  subject: string;
  body: string;
  isEnabled: boolean;
}

export interface GenerateCertificatesResult {
  created: number;
  existing: number;
  requeued: number;
  skipped: { userId: string; reason: string }[];
}

/**
 * A course whose certificate setup can be copied onto this one.
 *
 * Either half may be missing — a course can have a design and no email, or the
 * other way round — so the dialog has to disable what it cannot offer rather
 * than assume both are there.
 */
export interface FreeCourseCertificateCopySource {
  id: string;
  title: string;
  hasTemplate: boolean;
  hasEmail: boolean;
  templateName: string | null;
  emailSubject: string | null;
  emailEnabled: boolean;
  updatedAt: string | null;
}

export interface FreeCourseCertificateCopySources {
  sources: FreeCourseCertificateCopySource[];
  /** How many match the current search in total, ignoring the cap below. */
  total: number;
  /** How many rows the server actually returned. */
  limit: number;
  /** What copying would replace here, so the confirm step can be specific. */
  target: {
    hasTemplate: boolean;
    hasEmail: boolean;
    /** Already-issued certificates keep their own snapshot; used to warn only. */
    issuedCertificates: number;
  };
}
