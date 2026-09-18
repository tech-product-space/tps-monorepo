/**
 * The event side of certificate rendering.
 *
 * The drawing itself lives in `services/certificate/render.service.js`, which
 * is domain-free. All that is left here is the bit that *is* event-specific:
 * turning a certificate row into the placeholder values an event template
 * names. Free courses have the same file with `courseTitle` in place of
 * `eventTitle`.
 *
 * `renderCertificate` keeps its original `{ template, data }` signature so the
 * issue service and the preview controller did not have to change.
 */
import { CERTIFICATE_FIELD_KEYS } from "../../config/constants/eventCertificate.js";
import {
  formatIssuedDate,
  renderCertificate as renderCertificateCanvas,
} from "../certificate/render.service.js";

export { resolveOrientation } from "../certificate/render.service.js";

/**
 * Values the template's placeholders resolve to. A key not in here is skipped
 * by the renderer with a warning rather than drawn blank.
 */
const buildFieldValues = (data = {}) => ({
  [CERTIFICATE_FIELD_KEYS.RECIPIENT_NAME]: data.recipientName || "",
  [CERTIFICATE_FIELD_KEYS.ISSUED_DATE]: formatIssuedDate(
    data.issuedAt || Date.now(),
  ),
  [CERTIFICATE_FIELD_KEYS.CERTIFICATE_NO]: data.certificateNo || "",
  [CERTIFICATE_FIELD_KEYS.EVENT_TITLE]: data.eventTitle || "",
});

export const renderCertificate = ({ template, data }) =>
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
 * recipients do.
 */
export const PREVIEW_DATA = Object.freeze({
  recipientName: "Priyadarshini Venkataraman",
  certificateNo: "GRD-2026-PREVIEW1",
  eventTitle: "Sample Event",
  issuedAt: new Date("2026-01-15T00:00:00Z"),
});
