/**
 * Everything about certificates that is true regardless of what earned one.
 *
 * Split out of `eventCertificate.ts` when free courses started issuing them
 * too. Page geometry, the font manifest and the field/template shapes are
 * properties of the artifact, not of the thing being certified — so the editor,
 * the canvas and the preview dialog can be one implementation driven by a
 * `CertificateDomain` config rather than two copies drifting apart.
 *
 * `eventCertificate.ts` re-exports all of this, so imports written before the
 * split still resolve.
 */

export type CertificateAlign = "left" | "center" | "right";

/**
 * Decides the printed page size, not the artwork — the render always keeps the
 * background's aspect ratio and scales it to the width below.
 */
export type CertificateOrientation = "landscape" | "portrait";

/** A4's long edge for landscape, short edge for portrait. Mirrors the backend. */
export const CERTIFICATE_PAGE_WIDTH_PT: Record<CertificateOrientation, number> = {
  landscape: 842,
  portrait: 595,
};

/** Points to millimetres, for showing the admin a size they can picture. */
export const PT_TO_MM = 25.4 / 72;

/** An omitted orientation is inferred from the canvas, exactly as the API does. */
export const inferOrientation = (
  width: number,
  height: number,
): CertificateOrientation => (width >= height ? "landscape" : "portrait");

/** CSS numeric weights, matching CERTIFICATE_FONT_WEIGHTS on the backend. */
export type CertificateFontWeight = 300 | 400 | 500 | 600 | 700 | 800 | 900;

export const CERTIFICATE_WEIGHT_LABELS: Record<CertificateFontWeight, string> = {
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extrabold",
  900: "Black",
};

/**
 * Must stay in step with CERTIFICATE_FONTS in the backend — same families, same
 * weights, same CSS stack as `app/certificateFonts.ts` loads. A family offered
 * here with no bundled font file on the server renders in a substitute, and the
 * preview endpoint reports exactly that in a warning header.
 *
 * `weights` is per family because they genuinely differ: Great Vibes is a
 * single-weight script face, and offering it a Bold that does not exist just
 * moves the disappointment to the PDF.
 */
export interface CertificateFontDefinition {
  family: string;
  category: string;
  weights: CertificateFontWeight[];
  /** CSS font-family value. The var points at the copy next/font loaded. */
  stack: string;
}

export const CERTIFICATE_FONTS: CertificateFontDefinition[] = [
  {
    family: "Inter",
    category: "Sans serif",
    weights: [300, 400, 500, 600, 700, 900],
    stack: "var(--font-inter), sans-serif",
  },
  {
    family: "Montserrat",
    category: "Sans serif",
    weights: [300, 400, 500, 600, 700, 800],
    stack: "var(--font-montserrat), sans-serif",
  },
  {
    family: "Playfair Display",
    category: "Serif",
    weights: [400, 500, 600, 700, 800, 900],
    stack: "var(--font-playfair-display), serif",
  },
  {
    family: "EB Garamond",
    category: "Serif",
    weights: [400, 500, 600, 700, 800],
    stack: "var(--font-eb-garamond), serif",
  },
  {
    family: "Cinzel",
    category: "Display",
    weights: [400, 500, 600, 700, 800, 900],
    stack: "var(--font-cinzel), serif",
  },
  {
    family: "Great Vibes",
    category: "Script",
    weights: [400],
    stack: "var(--font-great-vibes), cursive",
  },
  {
    family: "Roboto Mono",
    category: "Monospace",
    weights: [400, 500, 700],
    stack: "var(--font-roboto-mono), monospace",
  },
];

export const CERTIFICATE_FONT_FAMILIES = CERTIFICATE_FONTS.map(
  (font) => font.family,
);

/**
 * What a field with no `fontFamily` renders in. Mirrors
 * CERTIFICATE_DEFAULT_FONT_FAMILY on the backend — deliberately a bundled
 * family, not a host font, so "System default" means the same thing on a
 * designer's laptop and in the container.
 */
export const CERTIFICATE_DEFAULT_FONT_FAMILY = "Inter";

/**
 * The value the family picker uses for "no explicit font".
 *
 * A sentinel rather than `""` because Radix rejects an empty SelectItem value,
 * and rather than the literal family name because the distinction matters: a
 * field that never chose a font is not substituted, and the render only warns
 * about the ones that were.
 */
export const CERTIFICATE_SYSTEM_FONT_VALUE = "__system";

export const certificateFontDefinition = (
  family?: string,
): CertificateFontDefinition =>
  CERTIFICATE_FONTS.find((font) => font.family === family) ??
  CERTIFICATE_FONTS.find(
    (font) => font.family === CERTIFICATE_DEFAULT_FONT_FAMILY,
  )!;

export const certificateFontStack = (family?: string): string =>
  certificateFontDefinition(family).stack;

/**
 * A placeholder box on the canvas.
 *
 * `key` is a plain string here rather than a union: each domain has its own
 * catalogue — events say `eventTitle`, free courses say `courseTitle` — and the
 * editor is driven by whichever `CertificateDomain` it is handed. The domain
 * types narrow it for their own call sites.
 */
export interface CertificateField {
  key: string;
  /**
   * Percentages of the canvas, not pixels — which is what lets the editor
   * position on a scaled preview and still match the server render exactly.
   */
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily?: string;
  /** A CSS number. "normal"/"bold" survive on templates that predate those. */
  fontWeight?: CertificateFontWeight | "normal" | "bold";
  align?: CertificateAlign;
  /** Percentage of canvas width the text must fit; it shrinks to obey. */
  maxWidth?: number;
}

/** The design itself, minus whichever id ties it to an event or a course. */
export interface CertificateTemplateBase {
  id: string;
  name: string;
  /** S3 key. Render with resolveStorageUrl(). */
  backgroundKey: string;
  canvasWidth: number;
  canvasHeight: number;
  /** Null on event templates saved before orientation existed — infer it. */
  orientation?: CertificateOrientation | null;
  fields: CertificateField[];
  createdAt?: string;
  updatedAt?: string;
}

export type CertificateTemplatePayload = Omit<
  CertificateTemplateBase,
  "id" | "createdAt" | "updatedAt"
>;

/**
 * Templates designed before numeric weights hold "normal" or "bold". Those are
 * the faces those strings always resolved to, so reading them this way keeps an
 * untouched template rendering exactly as it did.
 */
export const normalizeCertificateWeight = (
  weight: CertificateField["fontWeight"],
): CertificateFontWeight => {
  if (weight === "bold") return 700;
  if (weight === "normal" || weight === undefined || weight === null) return 400;

  const parsed = Number(weight);
  return (CERTIFICATE_WEIGHT_LABELS[parsed as CertificateFontWeight]
    ? parsed
    : 400) as CertificateFontWeight;
};

/** The nearest weight a family actually ships, for when it lacks the one set. */
export const nearestCertificateWeight = (
  family: string | undefined,
  weight: CertificateFontWeight,
): CertificateFontWeight => {
  const { weights } = certificateFontDefinition(family);

  return weights.includes(weight)
    ? weight
    : weights.reduce((best, candidate) =>
        Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best,
      );
};

/**
 * The renderer stops shrinking here and lets text overflow visibly rather than
 * scale a long name into nothing. Mirrors MIN_FONT_SIZE in the render service.
 */
export const CERTIFICATE_MIN_FONT_SIZE = 10;

export type CertificateStatus =
  | "Pending"
  | "Approved"
  | "Issuing"
  | "Issued"
  | "Failed"
  | "Revoked";

/**
 * One colour per status, shared by every screen that shows one. Three copies of
 * this map is how Issued ends up green in one place and grey in another.
 */
export const CERTIFICATE_STATUS_VARIANT: Record<
  CertificateStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  Pending: "outline",
  Approved: "secondary",
  Issuing: "secondary",
  Issued: "default",
  Failed: "destructive",
  Revoked: "outline",
};

/** A render warning the preview endpoint sent back in its header. */
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
 * What the shared editor needs to know about the thing being certified.
 *
 * Everything domain-specific the design canvas touches, in one object: which
 * placeholders exist, what they are called, what to draw for each while
 * designing, and where to save. Passing this rather than branching inside the
 * editor is what keeps one implementation honest — a new kind of certificate is
 * a new config, not a new `if`.
 */
export interface CertificateDomain {
  /** Placeholders this kind of certificate can position, in menu order. */
  fieldKeys: string[];
  /** Human labels for each key, shown in the field list and the add menu. */
  fieldLabels: Record<string, string>;
  /**
   * What each placeholder is drawn as on the canvas. Deliberately awkward
   * values — a long double-barrelled name is what catches an over-tight
   * `maxWidth` while designing rather than after fifty have gone out.
   */
  sampleValues: Record<string, string>;
  /** The placeholder whose value is the live title, drawn instead of a sample. */
  titleKey: string;
  /** The real title, so the canvas shows what recipients will actually read. */
  title: string;
  /**
   * Where a placeholder lands when it is first added, and what it looks like.
   *
   * Per domain rather than shared, because the sensible starting layout depends
   * on what the certificate says — and because the title key differs, a shared
   * map could not be keyed consistently anyway.
   */
  fieldDefaults: Record<string, Omit<CertificateField, "key">>;
  /** Which `/upload/admin/<type>/upload` bucket backgrounds go to. */
  uploadFolder: "event" | "free-course";
  /** Persistence. The editor knows nothing else about the API. */
  service: {
    getTemplate(id: string): Promise<CertificateTemplateBase | null>;
    saveTemplate(
      id: string,
      payload: CertificateTemplatePayload,
    ): Promise<unknown>;
    preview(
      id: string,
      payload: CertificateTemplatePayload,
    ): Promise<CertificatePreview>;
  };
}
