import { isAxiosError } from "axios";

import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import {
  CertificateListResponse,
  CertificateStatus,
  CertificateTemplate,
  CertificateReadiness,
  CertificateTemplatePayload,
  RecipientsResponse,
} from "@/gradient/types/eventCertificate";

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/events/certificates`;

export interface CertificatePreview {
  /** Object URL for the rendered PDF. Revoke it when done. */
  url: string;
  /**
   * Silent-failure report from the render: substituted fonts, text that had to
   * shrink, placeholders that no longer exist. Empty is the good case.
   */
  warnings: string[];
}

/**
 * Turn a failed blob request back into a normal `{ message }` error.
 *
 * `responseType: "blob"` applies to the error body too, so a 422 "Font X is not
 * available" arrives as a Blob and `getApiErrorMessage` finds no `.message` on
 * it — every preview failure reads as the same generic fallback, which is
 * exactly the case where the admin needs the real reason.
 */
const rethrowWithBlobMessage = async (error: unknown): Promise<never> => {
  const data = isAxiosError(error) ? error.response?.data : undefined;

  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message && isAxiosError(error) && error.response) {
        error.response.data = parsed;
      }
    } catch {
      // A non-JSON body (an HTML proxy error page, say) tells the admin
      // nothing useful — leave the caller's fallback wording in place.
    }
  }

  throw error;
};

export const eventCertificateService = {
  getTemplate: async (eventId: string): Promise<CertificateTemplate | null> => {
    try {
      const response = await PrivateAxios.get(`${BASE}/admin/${eventId}/template`);
      return response.data.data;
    } catch (error) {
      // No template yet is the normal starting state, not a failure.
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  saveTemplate: async (
    eventId: string,
    payload: CertificateTemplatePayload,
  ): Promise<CertificateTemplate> => {
    const response = await PrivateAxios.put(
      `${BASE}/admin/${eventId}/template`,
      payload,
    );
    return response.data.data;
  },

  /**
   * Render the real artifact with sample data.
   *
   * Server-side on purpose: a browser canvas has the designer's system fonts,
   * the server has only what is bundled, and that difference is exactly what
   * makes a certificate come out wrong. Accepts an unsaved template so the
   * editor can preview before committing.
   */
  preview: async (
    eventId: string,
    payload: CertificateTemplatePayload,
  ): Promise<CertificatePreview> => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/${eventId}/preview`,
      payload,
      { responseType: "blob" },
    ).catch(rethrowWithBlobMessage);

    const header = response.headers["x-certificate-warnings"];

    let warnings: string[] = [];
    if (header) {
      try {
        warnings = JSON.parse(header);
      } catch {
        warnings = [];
      }
    }

    return {
      url: URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      ),
      warnings,
    };
  },

  /**
   * "If someone submits feedback right now, does a certificate actually go out?"
   *
   * Worth asking before the event rather than after. Auto-issue on with no
   * certificate email is the one combination that fails silently — the
   * submission succeeds, and nobody hears anything.
   */
  readiness: async (eventId: string): Promise<CertificateReadiness> => {
    const response = await PrivateAxios.get(`${BASE}/admin/${eventId}/readiness`);
    return response.data.data;
  },

  /** Dry run — creates nothing. This is the admin's chance to spot a typo. */
  getRecipients: async (eventId: string): Promise<RecipientsResponse> => {
    const response = await PrivateAxios.get(
      `${BASE}/admin/${eventId}/recipients`,
    );
    return response.data.data;
  },

  /** Creates Pending rows. Omit `emails` to take everyone resolved. */
  createRecipients: async (
    eventId: string,
    emails?: string[],
  ): Promise<{ created: number }> => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/${eventId}/recipients`,
      emails ? { emails } : {},
    );
    return response.data.data;
  },

  /** Approving queues the rendering; it does not wait for it. */
  approve: async (
    eventId: string,
    payload: { certificateIds?: string[]; all?: boolean },
  ): Promise<{ approved: number }> => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/${eventId}/approve`,
      payload,
    );
    return response.data.data;
  },

  /**
   * Generate certificates for whole responses — the Feedback tab's button.
   *
   * One step, not three: resolve the submitter and everyone they named, create
   * what is missing, and queue it, all credited to the admin who pressed it.
   * Anyone who already has a certificate is left exactly as they are.
   */
  issueFromFeedback: async (
    eventId: string,
    payload: { feedbackIds?: string[]; all?: boolean },
  ): Promise<{
    message: string;
    data: {
      created: number;
      reapproved: number;
      queued: number;
      skipped: number;
      /** Responses from guests whose registration was declined. */
      skippedDeclined: number;
    };
  }> => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/${eventId}/feedback/issue`,
      payload,
    );
    return response.data;
  },

  /** `search` matches the certificate number, the name, or the email. */
  listCertificates: async (
    eventId: string,
    page = 1,
    limit = 10,
    status?: CertificateStatus,
    search?: string,
  ): Promise<CertificateListResponse> => {
    const response = await PrivateAxios.get(
      `${BASE}/admin/${eventId}/certificates`,
      {
        params: {
          page,
          limit,
          ...(status ? { status } : {}),
          ...(search ? { search } : {}),
        },
      },
    );
    return response.data;
  },

  /** Re-queues a Failed row, or resends an Issued one whose email never went. */
  retry: async (certificateId: string): Promise<{ message: string }> => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/certificates/${certificateId}/retry`,
    );
    return response.data;
  },

  revoke: async (certificateId: string): Promise<{ message: string }> => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/certificates/${certificateId}/revoke`,
    );
    return response.data;
  },

  /**
   * Undo a revoke. The PDF was never deleted, so this genuinely puts it back —
   * to Issued if it was rendered, Pending if it never got that far.
   */
  restore: async (certificateId: string): Promise<{ message: string }> => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/certificates/${certificateId}/restore`,
    );
    return response.data;
  },

  /**
   * Correct a name or email on request. Sends nothing — the row lands back on
   * Pending and the admin approves it deliberately. Correcting an already
   * Issued certificate revokes it and creates a replacement with a new number.
   */
  correctRecipient: async (
    certificateId: string,
    payload: { name?: string; email?: string; note?: string },
  ): Promise<{ message: string }> => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/certificates/${certificateId}/recipient`,
      payload,
    );
    return response.data;
  },
};
