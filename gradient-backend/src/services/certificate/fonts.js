import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GlobalFonts } from "@napi-rs/canvas";

import {
  CERTIFICATE_DEFAULT_FONT_FAMILY,
  CERTIFICATE_FONTS,
  CERTIFICATE_FONT_FAMILIES,
  CERTIFICATE_LEGACY_WEIGHTS,
} from "../../config/constants/certificate.js";
import logger from "../../util/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FONTS_DIR = path.resolve(__dirname, "../../assets/fonts");

/** family -> Set of weights that actually registered. */
const registered = new Map();

/**
 * Register the bundled certificate fonts. Called once at boot.
 *
 * This exists because a canvas renderer given a family it does not have does
 * not fail — it quietly substitutes something else, and the certificate comes
 * out looking wrong with no error anywhere. That is the failure mode in the TPS
 * implementation this replaces, and it only ever showed up in production
 * because the dev machines happened to have the fonts installed system-wide.
 *
 * So: register what we ship, then say plainly what is missing.
 *
 * Every weight of a family registers under the same alias. @napi-rs/canvas then
 * picks the face from the numeric weight in the font string — confirmed by
 * measuring the same string at each weight and getting six different widths.
 */
export const initCertificateFonts = () => {
  registered.clear();

  if (!fs.existsSync(FONTS_DIR)) {
    logger.warn(
      "Certificate fonts directory missing — certificates will render with substituted fonts",
      { expected: FONTS_DIR },
    );
    return { registered: [], missing: [...CERTIFICATE_FONT_FAMILIES] };
  }

  const missingFiles = [];

  for (const font of CERTIFICATE_FONTS) {
    for (const [weight, file] of Object.entries(font.faces)) {
      const fullPath = path.join(FONTS_DIR, file);

      if (!fs.existsSync(fullPath)) {
        missingFiles.push(file);
        continue;
      }

      if (GlobalFonts.registerFromPath(fullPath, font.family)) {
        if (!registered.has(font.family)) registered.set(font.family, new Set());
        registered.get(font.family).add(Number(weight));
      } else {
        logger.error("Failed to register certificate font", { file: fullPath });
      }
    }
  }

  if (missingFiles.length) {
    logger.warn("Certificate font files are missing", {
      missingFiles,
      fontsDir: FONTS_DIR,
    });
  }

  const missing = CERTIFICATE_FONT_FAMILIES.filter(
    (family) => !registered.has(family),
  );

  if (missing.length) {
    logger.warn(
      "Certificate font families offered in the editor have no bundled file — " +
        "templates using them will render with a substituted font",
      { missing, fontsDir: FONTS_DIR },
    );
  }

  logger.info("Certificate fonts registered", {
    families: Object.fromEntries(
      [...registered].map(([family, weights]) => [
        family,
        [...weights].sort((a, b) => a - b),
      ]),
    ),
  });

  return { registered: [...registered.keys()], missing };
};

export const isFontRegistered = (family) => registered.has(family);

/**
 * Turn whatever a template stored into a CSS numeric weight.
 *
 * Templates written before numeric weights hold "normal" or "bold", and those
 * have to keep rendering identically — 400 and 700 are the faces those strings
 * always resolved to.
 */
export const normalizeFontWeight = (weight) => {
  if (typeof weight === "number" && Number.isFinite(weight)) return weight;
  if (typeof weight === "string" && CERTIFICATE_LEGACY_WEIGHTS[weight]) {
    return CERTIFICATE_LEGACY_WEIGHTS[weight];
  }

  const parsed = Number(weight);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : CERTIFICATE_LEGACY_WEIGHTS.normal;
};

/** The registered weight closest to the one asked for. */
const nearestWeight = (available, wanted) =>
  [...available].reduce((best, candidate) =>
    Math.abs(candidate - wanted) < Math.abs(best - wanted) ? candidate : best,
  );

/**
 * Resolve the family and weight to actually draw with.
 *
 * Falls back to the default family, then to a generic — so a missing font
 * degrades to something readable rather than to whatever the OS decides.
 * Callers get `substituted` / `weightSubstituted` flags so the preview endpoint
 * can warn the admin before they save.
 */
export const resolveFontFace = (family, weight) => {
  const wanted = normalizeFontWeight(weight);

  const target =
    family && registered.has(family)
      ? family
      : registered.has(CERTIFICATE_DEFAULT_FONT_FAMILY)
        ? CERTIFICATE_DEFAULT_FONT_FAMILY
        : [...registered.keys()][0];

  if (!target) {
    // Nothing registered at all. Generic keyword, and the caller warns.
    return {
      family: "sans-serif",
      weight: wanted,
      // A field that never named a font has not been substituted — it is using
      // the default, which is what it asked for. Only flag the case where an
      // admin picked a font and did not get it, because that is the one that
      // makes a certificate come out looking wrong.
      substituted: Boolean(family),
      requested: family || null,
      weightSubstituted: false,
    };
  }

  const available = registered.get(target);
  const resolvedWeight = available.has(wanted)
    ? wanted
    : nearestWeight(available, wanted);

  return {
    family: target,
    weight: resolvedWeight,
    substituted: Boolean(family) && family !== target,
    requested: family || null,
    // Only interesting when the family itself came through: "Great Vibes has no
    // 700" is actionable, "the font you asked for is missing entirely" already
    // has its own warning and the weight is noise on top of it.
    weightSubstituted: resolvedWeight !== wanted,
    requestedWeight: wanted,
  };
};
