import { IPaginationMeta } from "./pagination";
import { CertificateSource, CertificateStatus } from "./eventCertificate";

export type FeedbackFieldType =
  | "shortText"
  | "longText"
  | "rating"
  | "select"
  | "multiSelect"
  | "url"
  | "email"
  | "phone"
  | "group";

/**
 * Mirrors `config/constants/eventFeedbackForms.js` in the backend. The API
 * serves the definition so the admin can show admins what is being asked
 * without a second copy of the questions living here.
 */
export interface FeedbackField {
  key: string;
  label: string;
  help?: string;
  type: FeedbackFieldType;
  required?: boolean;
  min?: number;
  max?: number;
  options?: string[];
  role?: string;
  repeatable?: boolean;
  fields?: FeedbackField[];
}

export interface FeedbackForm {
  title: string;
  description?: string;
  fields: FeedbackField[];
}

export interface FeedbackGuest {
  id: string;
  name: string;
  email: string;
  phone?: string;
  attendeeType?: string;
  status?: string;
  additionalData?: { registeredVia?: string; approvedVia?: string } | null;
}

/** Resolved through admin corrections, never read raw off `responses`. */
export interface FeedbackTeammate {
  name: string;
  email: string;
  phone?: string | null;
  /** Stored beside the number, not glued onto it — exports want them apart. */
  countryCode?: string | null;
  wasCorrected: boolean;
  originalEmail: string | null;
}

/**
 * One person a response earns a certificate for — the submitter, or someone
 * they named. `certificate` is null until it has been generated.
 */
export interface FeedbackRecipient {
  name: string;
  email: string;
  source: CertificateSource;
  /** Who named this teammate. Null for the submitter. */
  namedBy: string | null;
  certificate: {
    id: string;
    certificateNo: string;
    status: CertificateStatus;
    /** A PDF can exist while its email never landed; these are separate. */
    emailSentAt: string | null;
  } | null;
}

/** Per-response rollup, so a row can be read without expanding it. */
export interface FeedbackCertificateSummary {
  total: number;
  pending: number;
  inProgress: number;
  issued: number;
  failed: number;
  revoked: number;
  /** Nobody has created a certificate for these yet. */
  none: number;
}

export interface EventFeedback {
  id: string;
  eventId: string;
  guestId: string;
  responses: Record<string, unknown>;
  corrections: Record<string, unknown>;
  submittedAt: string;
  guest?: FeedbackGuest;
  teammates: FeedbackTeammate[];
  recipients: FeedbackRecipient[];
  certificateSummary: FeedbackCertificateSummary;
}

export interface EventFeedbackListResponse {
  data: EventFeedback[];
  meta: IPaginationMeta;
  form: FeedbackForm | null;
}

export interface EventFeedbackExportResponse {
  eventTitle: string;
  eventType: string;
  /** Derived from the form definition, so the sheet is the same shape each time. */
  columns: string[];
  rows: Record<string, string | number | null>[];
}

export interface EventSettings {
  autoIssueCertificate: boolean;
  allowSelfRegistrationOnFeedback: boolean;
  promoteWaitlistedOnFeedback: boolean;
  createCrmLeadOnFeedbackRegistration: boolean;
}
