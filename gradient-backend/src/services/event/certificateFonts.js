/**
 * Moved to `services/certificate/fonts.js` — the font manifest is shared by
 * every kind of certificate, not an event concern.
 *
 * Re-exported from the old path so `server.js` and the certificate tests keep
 * resolving. New code should import from `services/certificate/fonts.js`.
 */
export {
  initCertificateFonts,
  isFontRegistered,
  normalizeFontWeight,
  resolveFontFace,
} from "../certificate/fonts.js";
