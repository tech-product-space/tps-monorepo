import {
  uploadWrittenCourseImportImage,
  IMPORT_IMAGE_MAX_BYTES,
} from "@/services/written-course/wrttenCourseService";

// Converts a Google Docs / Word .docx into HTML, uploading the images it carries
// as it goes.
//
// Why .docx rather than the markdown Google Docs can copy: markdown is text, so
// it can only *reference* images, and the images in a Doc are not hosted
// anywhere a reference could point at. A .docx carries the image bytes, which is
// what the image node needs. So each image is uploaded to S3 here — the same
// endpoint the editor's image button uses — and the URL it returns goes into the
// `<img src>`, ready for `generateJSON` to read.
//
// Note the difference from the block importer, which stores an S3 *key* and
// rebuilds the URL at render time: the Tiptap image node renders `src`
// verbatim, so the resolved URL is what has to land in the HTML.

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/svg+xml": "svg",
};

export interface DocxHtmlOptions {
  /** The course embedded images are uploaded under. */
  courseId: string;
  /** Reports how many images have been uploaded so far. */
  onProgress?: (uploaded: number) => void;
}

/**
 * Converts a .docx to HTML, uploading embedded images to S3 as it goes.
 *
 * Images are uploaded during conversion so the preview shows the real thing.
 * That means abandoning an import can leave uploaded-but-unused objects in S3 —
 * harmless, and the alternative (upload on confirm) would preview blind.
 */
export async function docxToHtml(
  file: File,
  { courseId, onProgress }: DocxHtmlOptions,
): Promise<{ html: string; warnings: string[] }> {
  const warnings: string[] = [];

  // ~600 KB and only needed once a file is actually dropped.
  const mammoth = (await import("mammoth")).default;

  const arrayBuffer = await file.arrayBuffer();

  let imageIndex = 0;
  let uploaded = 0;

  // Deliberately no styleMap. Mammoth's defaults already turn real Heading 1-6
  // styles into h1-h6, and mapping anything else (Title, Subtitle) into a
  // heading would invent structure the admin never asked for — and, since
  // headings are what split the document into lessons, invent lessons too.
  const convertImage = mammoth.images.imgElement(async (image) => {
    const index = ++imageIndex;

    try {
      const bytes = await image.readAsArrayBuffer();
      const contentType = image.contentType || "image/png";

      if (bytes.byteLength > IMPORT_IMAGE_MAX_BYTES) {
        warnings.push(
          `Image ${index} is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB and was skipped (limit ${IMPORT_IMAGE_MAX_BYTES / 1024 / 1024} MB) — add it in the editor.`,
        );
        return { src: "" };
      }

      const ext = EXT_BY_TYPE[contentType] ?? "png";
      const { fileUrl } = await uploadWrittenCourseImportImage(
        bytes,
        contentType,
        `doc-${Date.now()}-${index}.${ext}`,
        courseId,
      );

      uploaded++;
      onProgress?.(uploaded);
      return { src: fileUrl };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "unknown error";
      warnings.push(
        `Image ${index} failed to upload (${message}) — add it in the editor.`,
      );
      return { src: "" };
    }
  });

  const result = await mammoth.convertToHtml({ arrayBuffer }, { convertImage });

  for (const message of result.messages) {
    if (message.type === "error") warnings.push(`Document: ${message.message}`);
  }

  return { html: result.value, warnings };
}

/**
 * An image whose upload was skipped renders as `<img src="">`. Dropping those
 * keeps a broken node out of the document.
 */
export function removeSkippedImages(root: ParentNode): void {
  root.querySelectorAll('img[src=""], img:not([src])').forEach((img) => {
    img.remove();
  });
}
