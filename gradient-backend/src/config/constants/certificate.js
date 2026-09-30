/**
 * Everything about certificates that is true regardless of what earned one.
 *
 * Split out of `eventCertificate.js` when free courses started issuing them
 * too. Nothing in here knows about events or courses — page geometry, the font
 * manifest and the storage prefix are properties of the artifact, not of the
 * thing being certified. `eventCertificate.js` re-exports the lot, so every
 * import written before the split still resolves.
 */

export const CERTIFICATE_ORIENTATION = Object.freeze({
  LANDSCAPE: "landscape",
  PORTRAIT: "portrait",
});

/**
 * Width, in PDF points, the finished page is scaled to per orientation — A4's
 * long edge for landscape, its short edge for portrait.
 *
 * The page always keeps the background's aspect ratio, so this is the only knob
 * that decides physical size. Without the portrait entry a portrait background
 * came out 842pt wide and ~1190pt tall — a 297×420mm document, twice A4.
 */
export const CERTIFICATE_PAGE_WIDTH_PT = Object.freeze({
  [CERTIFICATE_ORIENTATION.LANDSCAPE]: 842,
  [CERTIFICATE_ORIENTATION.PORTRAIT]: 595,
});

/**
 * Every weight the editor can offer, in CSS numeric terms.
 *
 * Numeric rather than the old "normal"/"bold" pair because a canvas picks a
 * face by weight, and with only two faces registered a request for anything in
 * between silently rounds to one of them. Verified against @napi-rs/canvas:
 * with all six Inter faces registered under one alias, each weight measures a
 * different width, and `bold` resolves to exactly the same face as 700.
 */
export const CERTIFICATE_FONT_WEIGHTS = Object.freeze([
  300, 400, 500, 600, 700, 800, 900,
]);

/** What "normal" and "bold" mean on templates written before numeric weights. */
export const CERTIFICATE_LEGACY_WEIGHTS = Object.freeze({
  normal: 400,
  bold: 700,
});

/**
 * Fonts the certificate renderer can use, and the file behind each weight.
 *
 * An explicit manifest rather than a scan of the directory: the family name a
 * template stores has to match the name the renderer registers, and deriving
 * that from a filename means a download named `PlayfairDisplay-Regular.ttf`
 * silently registers as "PlayfairDisplay" and every template asking for
 * "Playfair Display" renders in a substitute. Listing both sides here makes the
 * mismatch a startup warning instead.
 *
 * `faces` is keyed by weight so a family can offer only the weights it actually
 * ships — Great Vibes is a single-weight script face, and asking it for 700
 * should say so rather than quietly render the same 400.
 *
 * All of these are SIL Open Font License, so the files can be committed.
 */
export const CERTIFICATE_FONTS = Object.freeze([
  {
    family: "Inter",
    category: "Sans serif",
    faces: {
      300: "Inter-300.ttf",
      400: "Inter-400.ttf",
      500: "Inter-500.ttf",
      600: "Inter-600.ttf",
      700: "Inter-700.ttf",
      900: "Inter-900.ttf",
    },
  },
  {
    family: "Montserrat",
    category: "Sans serif",
    faces: {
      300: "Montserrat-300.ttf",
      400: "Montserrat-400.ttf",
      500: "Montserrat-500.ttf",
      600: "Montserrat-600.ttf",
      700: "Montserrat-700.ttf",
      800: "Montserrat-800.ttf",
    },
  },
  {
    family: "Playfair Display",
    category: "Serif",
    faces: {
      400: "PlayfairDisplay-400.ttf",
      500: "PlayfairDisplay-500.ttf",
      600: "PlayfairDisplay-600.ttf",
      700: "PlayfairDisplay-700.ttf",
      800: "PlayfairDisplay-800.ttf",
      900: "PlayfairDisplay-900.ttf",
    },
  },
  {
    family: "EB Garamond",
    category: "Serif",
    faces: {
      400: "EBGaramond-400.ttf",
      500: "EBGaramond-500.ttf",
      600: "EBGaramond-600.ttf",
      700: "EBGaramond-700.ttf",
      800: "EBGaramond-800.ttf",
    },
  },
  {
    family: "Cinzel",
    category: "Display",
    faces: {
      400: "Cinzel-400.ttf",
      500: "Cinzel-500.ttf",
      600: "Cinzel-600.ttf",
      700: "Cinzel-700.ttf",
      800: "Cinzel-800.ttf",
      900: "Cinzel-900.ttf",
    },
  },
  {
    family: "Great Vibes",
    category: "Script",
    faces: {
      400: "GreatVibes-400.ttf",
    },
  },
  {
    family: "Roboto Mono",
    category: "Monospace",
    faces: {
      400: "RobotoMono-400.ttf",
      500: "RobotoMono-500.ttf",
      700: "RobotoMono-700.ttf",
    },
  },
]);

/** Names offered in the admin editor. Derived so the two cannot drift. */
export const CERTIFICATE_FONT_FAMILIES = Object.freeze(
  CERTIFICATE_FONTS.map((font) => font.family),
);

/**
 * What a field with no `fontFamily` renders in.
 *
 * The editor calls this "System default", but it is deliberately a bundled
 * family rather than whatever the host happens to have installed — the
 * container has almost no fonts, the designer's laptop has hundreds, and a
 * default that differs between them is the exact bug this manifest exists to
 * prevent.
 */
export const CERTIFICATE_DEFAULT_FONT_FAMILY = "Inter";

/**
 * S3 prefix for issued PDFs. Both domains write under it, each into its own
 * sub-prefix (`certificates/<eventId>/…`, `certificates/free-course/<courseId>/…`)
 * so one lifecycle rule covers everything and nothing can collide.
 */
export const CERTIFICATE_S3_PREFIX = "certificates";

/** Sub-prefix for free course certificates, keeping them clear of event ids. */
export const FREE_COURSE_CERTIFICATE_S3_PREFIX = `${CERTIFICATE_S3_PREFIX}/free-course`;
