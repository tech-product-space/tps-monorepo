import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";

import {
  CERTIFICATE_ORIENTATION,
  CERTIFICATE_PAGE_WIDTH_PT,
} from "../../config/constants/certificate.js";
import { getObjectBuffer } from "../../util/s3.js";
import { resolveFontFace } from "./fonts.js";

// Below this the text is unreadable; better to let it overflow visibly than to
// shrink a long name into nothing and call it a success.
const MIN_FONT_SIZE = 10;

/**
 * Fall back to the shape of the background rather than assuming landscape.
 *
 * Templates designed before `orientation` existed have no stored value, and a
 * portrait one guessed as landscape prints at twice the intended size — so the
 * guess has to come from the canvas, not from a default.
 */
export const resolveOrientation = ({ orientation, canvasWidth, canvasHeight }) => {
  if (Object.values(CERTIFICATE_ORIENTATION).includes(orientation)) {
    return orientation;
  }

  return canvasWidth >= canvasHeight
    ? CERTIFICATE_ORIENTATION.LANDSCAPE
    : CERTIFICATE_ORIENTATION.PORTRAIT;
};

/**
 * How a date reads on a certificate. Exported so every domain formats it the
 * same way — the alternative is one saying "15 January 2026" and another
 * "15/01/2026" on documents that sit side by side on one dashboard.
 */
export const formatIssuedDate = (date) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * Shrink until the text fits the field's max width.
 *
 * Names vary far more in length than a template designer tests with. Without
 * this, "Dr. Priyadarshini Venkataraman" runs off the edge of a certificate
 * designed against "John Doe" — and nothing anywhere reports it.
 */
const fitFontSize = (ctx, text, field, canvasWidth, familyName, weight) => {
  const maxWidthPx = field.maxWidth
    ? (field.maxWidth / 100) * canvasWidth
    : canvasWidth;

  let size = field.fontSize;

  ctx.font = `${weight} ${size}px "${familyName}"`;

  while (ctx.measureText(text).width > maxWidthPx && size > MIN_FONT_SIZE) {
    size -= 1;
    ctx.font = `${weight} ${size}px "${familyName}"`;
  }

  return { size, shrunk: size < field.fontSize };
};

/**
 * Draw the certificate and return it as a single-page PDF.
 *
 * Domain-free: it is handed a template and an already-resolved map of field key
 * to string, and knows nothing about what earned the certificate. Each domain
 * owns its own placeholder catalogue and builds `values` from it — which is
 * what lets events say `eventTitle` and free courses say `courseTitle` without
 * this file growing a branch per domain.
 *
 * @param {object}  template   canvas dimensions, background key, field boxes
 * @param {object}  values     { [fieldKey]: string } — resolved and formatted
 * @param {string} [title]     PDF metadata title
 *
 * @returns {{ pdf: Buffer, warnings: string[] }}
 *
 * `warnings` is not decoration: it carries the silent failures — a substituted
 * font, a name that had to be shrunk — up to the preview endpoint so an admin
 * finds out at design time rather than after fifty certificates have gone out.
 */
export const renderCertificate = async ({ template, values, title }) => {
  const warnings = [];

  const { canvasWidth, canvasHeight, backgroundKey, fields = [] } = template;

  const orientation = resolveOrientation(template);

  const backgroundBuffer = await getObjectBuffer(backgroundKey);
  const background = await loadImage(backgroundBuffer);

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(background, 0, 0, canvasWidth, canvasHeight);

  for (const field of fields) {
    const text = values[field.key];

    // An unknown key means the template references a placeholder that no longer
    // exists — or one belonging to a different domain. Drawing "undefined" onto
    // a certificate is worse than omitting it.
    if (text === undefined) {
      warnings.push(`Unknown field "${field.key}" was skipped.`);
      continue;
    }

    if (!text) continue;

    const {
      family,
      weight,
      substituted,
      requested,
      weightSubstituted,
      requestedWeight,
    } = resolveFontFace(field.fontFamily, field.fontWeight);

    if (substituted) {
      warnings.push(
        `Font "${requested}" is not installed — "${field.key}" rendered in ${family}.`,
      );
    } else if (weightSubstituted) {
      warnings.push(
        `${family} has no ${requestedWeight} weight — "${field.key}" rendered at ${weight}.`,
      );
    }

    const { size, shrunk } = fitFontSize(
      ctx,
      text,
      field,
      canvasWidth,
      family,
      weight,
    );

    if (shrunk) {
      warnings.push(
        `"${text}" was too wide for "${field.key}" and was scaled from ${field.fontSize}px to ${size}px.`,
      );
    }

    // Percentages, not pixels — so the admin editor can position on a scaled
    // preview and still match this exactly.
    const x = (field.x / 100) * canvasWidth;
    const y = (field.y / 100) * canvasHeight;

    ctx.fillStyle = field.color || "#000000";
    ctx.textAlign = field.align || "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  const png = canvas.toBuffer("image/png");

  // The bitmap is an intermediate. Only the PDF is ever stored — decision 7.
  const pdf = await PDFDocument.create();

  const aspect = canvasWidth / canvasHeight;
  const pageWidth = CERTIFICATE_PAGE_WIDTH_PT[orientation];
  const pageHeight = pageWidth / aspect;

  const page = pdf.addPage([pageWidth, pageHeight]);
  const embedded = await pdf.embedPng(png);

  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });

  pdf.setTitle(title || "Certificate preview");
  pdf.setProducer("Gradient Learnings");

  return {
    pdf: Buffer.from(await pdf.save()),
    warnings,
  };
};
