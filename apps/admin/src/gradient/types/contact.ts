export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Filled in by the list and detail endpoints, not stored on the row. */
  contactCount?: number;
  createdAdmin?: { id: string; name: string; email: string } | null;
}

export interface Contact {
  id: string;
  contactListId: string;
  name: string | null;
  email: string;
  phone: string | null;
  /** Every CSV column that was not name, email or phone, keyed by header. */
  additionalData: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/**
 * What an upload actually did.
 *
 * Three numbers rather than success or failure, because a real contact CSV is
 * never entirely clean — "3,997 added, 41 already here, 3 had no email address"
 * is something an admin can act on.
 */
export interface UploadResult {
  created: number;
  skipped: number;
  invalid: number;
  totalInList: number;
  truncated?: boolean;
}
