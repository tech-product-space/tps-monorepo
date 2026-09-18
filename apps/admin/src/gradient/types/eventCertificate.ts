/**
 * Event certificates — the parts specific to an event earning one.
 *
 * Page geometry, the font manifest, weights and the field/template shapes moved
 * to `certificate.ts` when free courses started issuing certificates too. They
 * are re-exported here rather than left behind, so every import written against
 * this path keeps working — the split is an internal reorganisation, not an API
 * change.
 */

export * from "./certificate";

import type {
  CertificateField,
  CertificateStatus,
  CertificateTemplateBase,
} from "./certificate";

/** Placeholders an event template can position. Anything else is skipped. */
export type CertificateFieldKey =
  | "recipientName"
  | "issuedDate"
  | "certificateNo"
  | "eventTitle";

export const CERTIFICATE_FIELD_KEYS: CertificateFieldKey[] = [
  "recipientName",
  "issuedDate",
  "certificateNo",
  "eventTitle",
];

export const CERTIFICATE_FIELD_LABELS: Record<CertificateFieldKey, string> = {
  recipientName: "Recipient name",
  issuedDate: "Issue date",
  certificateNo: "Certificate number",
  eventTitle: "Event title",
};

/**
 * What each placeholder is drawn as on the editor canvas. Same values the
 * preview endpoint uses (PREVIEW_DATA in the render service) — deliberately
 * awkward, so an over-tight `maxWidth` shows up while designing rather than
 * after fifty certificates have gone out.
 */
export const CERTIFICATE_SAMPLE_VALUES: Record<CertificateFieldKey, string> = {
  recipientName: "Priyadarshini Venkataraman",
  eventTitle: "Sample Event",
  issuedDate: "15 January 2026",
  certificateNo: "GRD-2026-PREVIEW1",
};

/** An event's design, which is the shared shape plus the event it belongs to. */
export interface CertificateTemplate extends CertificateTemplateBase {
  eventId: string;
  fields: CertificateField[];
}

/**
 * Whether the event can issue a certificate without an admin touching anything.
 *
 * Both halves are required. A missing email is not the softer failure — the
 * certificate is never created at all, because an Issued row nobody sent reads
 * as success in every list that counts it.
 */
export interface CertificateReadiness {
  autoIssueCertificate: boolean;
  hasTemplate: boolean;
  hasEmailTemplate: boolean;
  missing: ("template" | "email")[];
  ready: boolean;
  canAcceptResponse: boolean;
  willAutoIssue: boolean;
}

export type CertificateSource = "Attendee" | "Teammate";

/** A prospective recipient from the dry run. Nothing is created yet. */
export interface CertificateRecipient {
  name: string;
  email: string;
  source: CertificateSource;
  /** Who named this teammate, when source is Teammate. */
  namedBy: string | null;
  guestId: string | null;
  /** False means never registered — a flag to catch typos, not an exclusion. */
  registered: boolean;
  existingCertificate: {
    id: string;
    certificateNo: string;
    status: CertificateStatus;
  } | null;
}

export interface RecipientsResponse {
  recipients: CertificateRecipient[];
  summary: {
    total: number;
    unregistered: number;
    alreadyIssued: number;
    teammates: number;
  };
}

export interface EventCertificateRow {
  id: string;
  eventId: string;
  guestId: string | null;
  certificateNo: string;
  recipientName: string;
  recipientEmail: string;
  source: CertificateSource;
  status: CertificateStatus;
  fileKey: string | null;
  issuedAt: string | null;
  /** Separate from issuedAt: a PDF can exist while its email never landed. */
  emailSentAt: string | null;
  attempts: number;
  lastError: string | null;
  approvedVia: "Auto" | "Admin" | "Correction" | null;
  replacesCertificateId: string | null;
  createdAt: string;
}

export interface CertificateListResponse {
  data: EventCertificateRow[];
  meta: import("./pagination").IPaginationMeta;
  counts: Partial<Record<CertificateStatus, number>>;
}
