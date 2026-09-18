/**
 * Replaced by the shared editor in `components/Common/Certificate/`, which
 * takes a `CertificateDomain` describing what is being certified.
 *
 * Kept as a re-export only so a stale import does not break the build; the
 * props changed (`subjectId` + `domain`, not `eventId` + `eventTitle`), so
 * call sites have to be updated rather than left alone.
 */
export { default } from "@/gradient/components/Common/Certificate/CertificateEditor";
