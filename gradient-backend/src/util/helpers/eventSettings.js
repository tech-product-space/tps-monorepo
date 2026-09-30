import { EVENT_SETTINGS_DEFAULTS } from "../../config/constants/event.js";

/**
 * The only supported way to read Events.settings.
 *
 * Reading `event.settings.autoIssueCertificate` directly is wrong: every row
 * created before that key existed stores `{}`, so the lookup yields undefined
 * and a default-on switch reads as off. Layering the defaults underneath keeps
 * old rows behaving as intended and makes adding a switch a constant edit.
 */
export const resolveEventSettings = (event) => ({
  ...EVENT_SETTINGS_DEFAULTS,
  ...(event?.settings || {}),
});

/**
 * Merge an incoming partial into what is already stored, dropping any key that
 * is not a known setting.
 *
 * Merging rather than replacing is the documented rule for JSONB config in this
 * repo: an admin form that posts one toggle must not blank the other three.
 * Filtering to known keys stops a typo'd field name from being persisted
 * forever as dead weight that never matches a default.
 */
export const mergeEventSettings = (event, incoming = {}) => {
  const allowed = Object.keys(EVENT_SETTINGS_DEFAULTS);

  const filtered = Object.fromEntries(
    Object.entries(incoming).filter(
      ([key, value]) => allowed.includes(key) && typeof value === "boolean",
    ),
  );

  return {
    ...(event?.settings || {}),
    ...filtered,
  };
};
