/**
 * Moved to `components/Common/Certificate/` — the design surface is shared
 * by event and free course certificates now.
 *
 * Re-exported from the old path so anything still importing it here keeps
 * working. New code should import from the shared location.
 */
export { default } from "@/gradient/components/Common/Certificate/CertificateCanvas";
export type { ZoomLevel } from "@/gradient/components/Common/Certificate/CertificateCanvas";
