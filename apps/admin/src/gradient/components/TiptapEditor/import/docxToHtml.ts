import mammoth from "mammoth";

import { uploadFile } from "@/gradient/services/fileUpload";

// Converts a Google Docs / Word .docx into HTML, uploading the images it
// carries as it goes.
//
// Why .docx rather than the markdown Google Docs can copy: markdown is text, so
// it can only *reference* images, and the images in a Doc are not hosted
// anywhere a reference could point at. A .docx carries the image bytes, which is
// what the image node needs — it renders an S3 key, not a data URI. So each
// image is uploaded to S3 here (the same endpoint the editor's image button
// uses) and the returned key goes into the node.
//
// Shared by every importer: lessons split one document into many, a blog keeps
// it whole, but both need the same bytes-to-HTML step against their own S3
// entity.

/** Matches the entity types `uploadFile` accepts. */
export type DocxEntityType =
  | "blog"
  | "event"
  | "resource"
  | "free-course"
  | "course"
  | "project";

export interface DocxHtmlOptions {
  /** Which S3 bucket path embedded images are uploaded under. */
  entityType: DocxEntityType;
  /** The row the images belong to — the blog, course or resource id. */
  entityId: string;
  onProgress?: (message: string) => void;
}

// Mirrors the backend's ALLOWED image handling. Anything larger is skipped with
// a warning rather than failing the whole import — one oversized screenshot
// should not cost the admin the other 40 lessons.
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
};

const base64ToBlob = (base64: string, contentType: string): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
};

/**
 * Converts a .docx to HTML, uploading embedded images to S3 as it goes.
 * Returns the HTML plus any per-image warnings.
 */
export async function docxToHtml(
  file: File,
  { entityType, entityId, onProgress }: DocxHtmlOptions,
): Promise<{ html: string; warnings: string[] }> {
  const warnings: string[] = [];
  let imageIndex = 0;

  const arrayBuffer = await file.arrayBuffer();

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      // Deliberately no styleMap. Mammoth's defaults already turn real Heading
      // 1-6 styles into h1-h6, and mapping anything else (Title, Subtitle) into
      // a heading would invent structure the admin never asked for.
      convertImage: mammoth.images.imgElement(async (image) => {
        imageIndex += 1;
        const position = imageIndex;

        try {
          const contentType = image.contentType || "image/png";
          const ext = EXT_BY_TYPE[contentType];

          if (!ext) {
            warnings.push(
              `Image ${position} is a ${contentType}, which is not supported — it was skipped.`,
            );
            return { src: "" };
          }

          const base64 = await image.read("base64");
          const blob = base64ToBlob(base64, contentType);

          if (blob.size > IMAGE_MAX_BYTES) {
            warnings.push(
              `Image ${position} is ${(blob.size / 1024 / 1024).toFixed(1)} MB, over the 4 MB limit — it was skipped.`,
            );
            return { src: "" };
          }

          onProgress?.(`Uploading image ${position}...`);

          const imageFile = new File([blob], `import-${position}.${ext}`, {
            type: contentType,
          });
          const key = await uploadFile(imageFile, entityType, entityId);

          return { src: key };
        } catch {
          warnings.push(`Image ${position} failed to upload — it was skipped.`);
          return { src: "" };
        }
      }),
    },
  );

  // Mammoth's own messages are mostly unmapped-style noise; surface only the
  // ones an admin can act on.
  for (const message of result.messages) {
    if (message.type === "warning" && /image/i.test(message.message)) {
      warnings.push(message.message);
    }
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
