/**
 * The free course side of certificate rendering.
 *
 * The drawing lives in `services/certificate/render.service.js`, which is
 * domain-free. All that is here is the event-equivalent bit that *is* specific:
 * turning a certificate row into the placeholder values a course template
 * names — `courseTitle` where the event catalogue says `eventTitle`.
 */
import { FREE_COURSE_CERTIFICATE_FIELD_KEYS } from "../../config/constants/freeCourseCertificate.js";
import {
  formatIssuedDate,
  renderCertificate as renderCertificateCanvas,
} from "../certificate/render.service.js";

export { resolveOrientation } from "../certificate/render.service.js";

/**
 * Values the template's placeholders resolve to. A key not in here is skipped
 * by the renderer with a warning rather than drawn blank — which is what
 * catches a template carrying `eventTitle` by mistake.
 */
const buildFieldValues = (data = {}) => ({
  [FREE_COURSE_CERTIFICATE_FIELD_KEYS.RECIPIENT_NAME]: data.recipientName || "",
  [FREE_COURSE_CERTIFICATE_FIELD_KEYS.ISSUED_DATE]: formatIssuedDate(
    data.issuedAt || Date.now(),
  ),
  [FREE_COURSE_CERTIFICATE_FIELD_KEYS.CERTIFICATE_NO]: data.certificateNo || "",
  [FREE_COURSE_CERTIFICATE_FIELD_KEYS.COURSE_TITLE]: data.courseTitle || "",
});

export const renderFreeCourseCertificate = ({ template, data }) =>
  renderCertificateCanvas({
    template,
    values: buildFieldValues(data),
    title: data?.certificateNo
      ? `Certificate ${data.certificateNo}`
      : "Certificate preview",
  });

/**
 * Sample data for the admin preview. Deliberately awkward — a long
 * double-barrelled name is what catches an over-tight `maxWidth` before real
 * learners do.
 */
export const PREVIEW_DATA = Object.freeze({
  recipientName: "Priyadarshini Venkataraman",
  certificateNo: "GRD-2026-PREVIEW1",
  courseTitle: "Sample Course",
  issuedAt: new Date("2026-01-15T00:00:00Z"),
});
