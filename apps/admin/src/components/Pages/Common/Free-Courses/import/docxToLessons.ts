import type { IBlockBase } from "@/components/block-editor/types/block.types";
import {
  uploadWrittenCourseImportImage,
  IMPORT_IMAGE_MAX_BYTES,
} from "@/services/written-course/wrttenCourseService";
import {
  htmlNodesToBlocks,
  wrapInRootLayout,
  groupNodesByHeading,
} from "./htmlToBlocks";

// Turns a Google Docs / Word .docx into lessons.
//
// Why .docx rather than the markdown Google Docs can copy: markdown is text, so
// it can only *reference* images, and the images in a Doc aren't hosted anywhere
// a reference could point at. A .docx carries the image bytes, which is what the
// image block ultimately needs — it renders an S3 key, not a URL. So each image
// is uploaded to S3 here (same endpoint the editor's image button uses) and the
// returned key goes straight into the block.

export interface DocxLesson {
  title: string;
  blocks: IBlockBase[];
  warnings: string[];
}

export interface DocxImportResult {
  lessons: DocxLesson[];
  warnings: string[];
}

export type SplitLevel = "h1" | "h2" | "none";

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

const titleFromFileName = (name: string) =>
  name.replace(/\.docx$/i, "").replace(/[_-]+/g, " ").trim() || "Untitled";

/**
 * Converts a .docx into lessons, uploading every embedded image to S3 first.
 *
 * Images are uploaded during conversion so the preview shows the real thing.
 * That means abandoning an import can leave uploaded-but-unused objects in S3 —
 * harmless, and the alternative (upload on confirm) would preview blind.
 */
export async function docxToLessons(
  file: File,
  opts: {
    courseId: string;
    splitOn?: SplitLevel;
    // Reports images uploaded so far. There is no total: mammoth reveals images
    // one at a time as it converts, so the count isn't known until it finishes.
    onProgress?: (uploaded: number) => void;
  },
): Promise<DocxImportResult> {
  const { courseId, splitOn = "h1", onProgress } = opts;
  const warnings: string[] = [];

  // ~600 KB and only needed once a file is actually dropped.
  const mammoth = (await import("mammoth")).default;

  const arrayBuffer = await file.arrayBuffer();

  // src -> uploaded S3 key. mammoth hands us each image once; we key the map by
  // the marker we hand back so htmlNodesToBlocks can resolve <img> to a key.
  const keyBySrc = new Map<string, string>();
  let imageIndex = 0;
  let uploaded = 0;

  const convertImage = mammoth.images.imgElement(async (image) => {
    const index = ++imageIndex;
    const marker = `imported-image-${index}`;
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
      const { key } = await uploadWrittenCourseImportImage(
        bytes,
        contentType,
        `doc-${Date.now()}-${index}.${ext}`,
        courseId,
      );

      keyBySrc.set(marker, key);
      uploaded++;
      onProgress?.(uploaded);
      return { src: marker };
    } catch (err: any) {
      warnings.push(
        `Image ${index} failed to upload (${err?.message ?? "unknown error"}) — add it in the editor.`,
      );
      return { src: "" };
    }
  });

  const result = await mammoth.convertToHtml({ arrayBuffer }, { convertImage });

  for (const m of result.messages) {
    if (m.type === "error") warnings.push(`Document: ${m.message}`);
  }

  const doc = new DOMParser().parseFromString(
    `<body>${result.value}</body>`,
    "text/html",
  );
  const nodes = Array.from(doc.body.childNodes);

  const imageKeyFor = (img: Element): string | null => {
    const src = img.getAttribute("src") ?? "";
    return keyBySrc.get(src) ?? null;
  };

  const splitTag = splitOn === "h1" ? "H1" : splitOn === "h2" ? "H2" : null;
  const groups = groupNodesByHeading(nodes, splitTag);

  const lessons: DocxLesson[] = [];

  for (const group of groups) {
    const converted = htmlNodesToBlocks(group.nodes, imageKeyFor);
    const blocks = wrapInRootLayout(converted.blocks);

    // Content sitting above the first split heading has no title of its own.
    const untitled = group.title === null;
    if (untitled && blocks.length === 0) continue;

    if (untitled && splitTag) {
      warnings.push(
        `Some content appeared before the first ${splitOn.toUpperCase()} and became a lesson named after the file — rename or remove it below.`,
      );
    }

    lessons.push({
      title: group.title ?? titleFromFileName(file.name),
      blocks,
      warnings: converted.warnings,
    });
  }

  if (lessons.length === 0) {
    warnings.push("That document appears to be empty.");
  } else if (splitTag && lessons.every((l) => l.title === titleFromFileName(file.name))) {
    warnings.push(
      `No ${splitOn.toUpperCase()} headings found, so the whole document became one lesson. Use Heading 1 in Google Docs to split it into several.`,
    );
  }

  return { lessons, warnings };
}
