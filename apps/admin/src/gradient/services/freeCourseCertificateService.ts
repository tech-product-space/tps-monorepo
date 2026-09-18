import { isAxiosError } from "axios";

import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import type {
  CertificatePreview,
  CertificateTemplatePayload,
} from "@/gradient/types/certificate";
import type {
  FreeCourseCertificateCopySources,
  FreeCourseCertificateReadiness,
  FreeCourseCertificateRow,
  FreeCourseCertificateTemplate,
  FreeCourseEmailTemplate,
  FreeCourseLearnersResponse,
  GenerateCertificatesResult,
} from "@/gradient/types/freeCourseCertificate";

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/free-courses/certificates`;

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

export const freeCourseCertificateService = {
  getTemplate: async (
    courseId: string,
  ): Promise<FreeCourseCertificateTemplate | null> => {
    try {
      const response = await PrivateAxios.get(
        `${BASE}/admin/${courseId}/template`,
      );
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
    courseId: string,
    payload: CertificateTemplatePayload,
  ): Promise<FreeCourseCertificateTemplate> => {
    const response = await PrivateAxios.put(
      `${BASE}/admin/${courseId}/template`,
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
    courseId: string,
    payload: CertificateTemplatePayload,
  ): Promise<CertificatePreview> => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/${courseId}/preview`,
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

  getEmailTemplate: async (
    courseId: string,
  ): Promise<FreeCourseEmailTemplate | null> => {
    try {
      const response = await PrivateAxios.get(`${BASE}/admin/${courseId}/email`);
      return response.data.data;
    } catch (error) {
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  saveEmailTemplate: async (
    courseId: string,
    payload: { subject: string; body: string; isEnabled?: boolean },
  ): Promise<FreeCourseEmailTemplate> => {
    const response = await PrivateAxios.put(
      `${BASE}/admin/${courseId}/email`,
      payload,
    );
    return response.data.data;
  },

  /**
   * Send the certificate email to one address.
   *
   * Takes the subject and body on screen rather than the saved row: the point
   * of a test is to check what you are looking at, which right after an edit is
   * not what is in the database. Ignores the send switch — a parked draft is
   * exactly when you want to test.
   */
  sendTestEmail: async (
    courseId: string,
    payload: {
      subject: string;
      body: string;
      to: string;
      recipientName?: string;
    },
  ): Promise<{ message: string }> => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/${courseId}/email/test`,
      payload,
    );
    return response.data;
  },

  /**
   * Courses with a design or an email worth copying, plus what is here now.
   *
   * Searched and capped server-side. `total` is the count behind the cap, so
   * the dialog can say "20 of 143" rather than implying it is showing all of
   * them. Matches on the course title and the design's name.
   */
  copySources: async (
    courseId: string,
    params: { search?: string; limit?: number } = {},
  ): Promise<FreeCourseCertificateCopySources> => {
    const response = await PrivateAxios.get(
      `${BASE}/admin/${courseId}/copy-sources`,
      { params },
    );
    return response.data.data;
  },

  /**
   * Replace this course's design and/or certificate email with another's.
   *
   * The background image is shared by reference, not duplicated, and
   * `courseTitle` is a placeholder resolved at render time — so a copied design
   * prints *this* course's title. Certificates already issued are untouched:
   * they carry a snapshot of the design they were made with.
   */
  copyFrom: async (
    courseId: string,
    payload: { fromCourseId: string; template: boolean; email: boolean },
  ): Promise<{ message: string; data: { copied: string[] } }> => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/${courseId}/copy`,
      payload,
    );
    return response.data;
  },

  /**
   * "If someone finishes the last lesson right now, does a certificate go out?"
   *
   * Cheap enough to poll. Auto-issue on with no certificate email is the one
   * combination that fails silently — the learner finishes, and nobody hears
   * anything.
   */
  readiness: async (
    courseId: string,
  ): Promise<FreeCourseCertificateReadiness> => {
    const response = await PrivateAxios.get(
      `${BASE}/admin/${courseId}/readiness`,
    );
    return response.data.data;
  },

  /**
   * Everyone who has finished, and where their certificate stands.
   *
   * `filter` narrows to the rows worth acting on: `none` (finished, no
   * certificate), `failed`, `notEmailed`.
   */
  getLearners: async (
    courseId: string,
    filter?: "none" | "failed" | "notEmailed",
  ): Promise<FreeCourseLearnersResponse> => {
    const response = await PrivateAxios.get(
      `${BASE}/admin/${courseId}/learners`,
      { params: filter ? { filter } : {} },
    );
    return response.data.data;
  },

  /**
   * Generate for the selected learners, or for everyone eligible.
   *
   * Overrides the course's auto-issue switch — that is what the button means —
   * but not readiness or completion. Generating with no design would only mint
   * rows that fail to render.
   */
  generate: async (
    courseId: string,
    target: { userIds: string[] } | { all: true },
  ): Promise<GenerateCertificatesResult> => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/${courseId}/generate`,
      target,
    );
    return response.data.data;
  },

  /** Lookup by certificate number, name or address. */
  listCertificates: async (
    courseId: string,
    params: { search?: string; status?: string } = {},
  ): Promise<FreeCourseCertificateRow[]> => {
    const response = await PrivateAxios.get(
      `${BASE}/admin/${courseId}/certificates`,
      { params },
    );
    return response.data.data;
  },

  /** Re-queues a Failed row, or one stalled on Approved. Re-renders the PDF. */
  retry: async (certificateId: string): Promise<void> => {
    await PrivateAxios.post(`${BASE}/admin/certificates/${certificateId}/retry`);
  },

  /**
   * Send the email again. Never re-renders — an already-downloaded certificate
   * must not change under the recipient.
   */
  resendEmail: async (certificateId: string): Promise<void> => {
    await PrivateAxios.post(
      `${BASE}/admin/certificates/${certificateId}/resend`,
    );
  },

  revoke: async (certificateId: string, reason?: string): Promise<void> => {
    await PrivateAxios.patch(
      `${BASE}/admin/certificates/${certificateId}/revoke`,
      reason ? { reason } : {},
    );
  },

  restore: async (certificateId: string): Promise<void> => {
    await PrivateAxios.patch(
      `${BASE}/admin/certificates/${certificateId}/restore`,
    );
  },

  /**
   * Correct the name. Revokes the original and issues a replacement rather than
   * editing in place — the old PDF may already have been downloaded, and
   * swapping the file under a number somebody has shared is worse than issuing
   * a new one.
   */
  correctRecipient: async (
    certificateId: string,
    recipientName: string,
  ): Promise<{ certificateNo: string }> => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/certificates/${certificateId}/recipient`,
      { recipientName },
    );
    return response.data.data;
  },
};
