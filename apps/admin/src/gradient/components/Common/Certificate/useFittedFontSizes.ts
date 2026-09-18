"use client";

import { useEffect, useMemo, useState } from "react";

import {
  CERTIFICATE_FONTS,
  CERTIFICATE_MIN_FONT_SIZE,
  CertificateField,
  certificateFontDefinition,
  nearestCertificateWeight,
  normalizeCertificateWeight,
} from "@/gradient/types/certificate";

export interface FittedField {
  /** The size the text is actually drawn at, after shrink-to-fit. */
  size: number;
  /** True when `maxWidth` forced it below the configured size. */
  shrunk: boolean;
  /** Rendered width in canvas pixels — used to draw the selection box. */
  width: number;
  /** The weight actually drawn; families do not all ship every weight. */
  weight: number;
}

export type FittedFields = Partial<Record<string, FittedField>>;

/**
 * One offscreen canvas for every measurement on the page. `measureText` needs a
 * 2D context and creating one per keystroke is measurably slow.
 */
let measureContext: CanvasRenderingContext2D | null | undefined;

const getMeasureContext = () => {
  if (measureContext === undefined) {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  return measureContext;
};

/**
 * Turn `var(--font-playfair-display), serif` into the family names next/font
 * actually generated.
 *
 * `ctx.font` is parsed as a CSS font shorthand with no cascade behind it, so a
 * `var()` in the string makes the whole assignment invalid and measurement
 * silently falls back to the previous font. The DOM can use the variable; the
 * measuring context cannot.
 */
const resolveStacks = (): Record<string, string> => {
  const styles = getComputedStyle(document.body);

  return Object.fromEntries(
    CERTIFICATE_FONTS.map((font) => [
      font.family,
      font.stack.replace(
        /var\((--[\w-]+)\)/g,
        (_, variable: string) =>
          styles.getPropertyValue(variable).trim() || `"${font.family}"`,
      ),
    ]),
  );
};

/**
 * Mirror of `fitFontSize` in the backend's render service.
 *
 * The editor is a WYSIWYG of a server render, and the one thing the server does
 * that a naive preview does not is shrink text that overruns its `maxWidth`. An
 * editor showing a 64px name that lands at 38px in the PDF is worse than no
 * preview at all, so the same loop runs here against the same font files.
 */
export function useFittedFontSizes(
  fields: CertificateField[],
  values: Record<string, string>,
  canvasWidth: number,
): FittedFields {
  const [stacks, setStacks] = useState<Record<string, string> | null>(null);

  // Measuring before the webfonts arrive returns fallback metrics, which is how
  // a preview ends up disagreeing with the render by a few pixels a line. Ask
  // for each face explicitly rather than trusting `fonts.ready` — nothing has
  // painted in Cinzel yet when the editor first mounts, so it would resolve
  // immediately with the font still unloaded.
  useEffect(() => {
    let cancelled = false;

    const resolved = resolveStacks();

    let loaded: Promise<unknown> = Promise.resolve();

    try {
      if (document.fonts) {
        loaded = Promise.all(
          CERTIFICATE_FONTS.flatMap((font) =>
            font.weights.map((weight) =>
              document.fonts.load(`${weight} 64px ${resolved[font.family]}`),
            ),
          ),
        ).catch(() => undefined);
      }
    } catch {
      // `load()` throws rather than rejecting on a font string the browser
      // will not parse. Measuring with the fallback is a slightly wrong
      // canvas; an editor that fails to mount is no canvas at all.
    }

    loaded.then(() => {
      if (!cancelled) setStacks(resolved);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const fitted: FittedFields = {};

    const ctx = stacks && canvasWidth ? getMeasureContext() : null;
    if (!ctx || !stacks) return fitted;

    for (const field of fields) {
      const text = values[field.key] ?? "";

      const maxWidthPx = field.maxWidth
        ? (field.maxWidth / 100) * canvasWidth
        : canvasWidth;

      // The renderer draws the nearest weight the family ships, so measuring
      // the one that was asked for would disagree with the PDF on every
      // Great Vibes field set to bold.
      const weight = nearestCertificateWeight(
        field.fontFamily,
        normalizeCertificateWeight(field.fontWeight),
      );

      const stack = stacks[certificateFontDefinition(field.fontFamily).family];

      let size = field.fontSize;
      ctx.font = `${weight} ${size}px ${stack}`;

      while (
        ctx.measureText(text).width > maxWidthPx &&
        size > CERTIFICATE_MIN_FONT_SIZE
      ) {
        size -= 1;
        ctx.font = `${weight} ${size}px ${stack}`;
      }

      fitted[field.key] = {
        size,
        shrunk: size < field.fontSize,
        width: ctx.measureText(text).width,
        weight,
      };
    }

    return fitted;
  }, [fields, values, canvasWidth, stacks]);
}
