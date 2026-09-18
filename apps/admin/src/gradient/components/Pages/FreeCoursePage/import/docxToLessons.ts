import {
  docxToSections,
  type DocxSection,
  type SplitLevel,
} from "@/gradient/components/TiptapEditor/import/docxToSections";

// Lessons, in terms of the shared .docx splitter.
//
// The splitting, the image uploads and the code-fence handling all live in
// `docxToSections` because a project guide imports the same way; what is
// course-specific is only the S3 entity the images go under and the word
// "lesson" in the warnings.

export type { SplitLevel };

export type DocxLesson = DocxSection;

export interface DocxImportResult {
  lessons: DocxLesson[];
  warnings: string[];
}

export interface DocxImportOptions {
  splitLevel: SplitLevel;
  /** Used as the S3 entity id for any images pulled out of the document. */
  courseId: string;
  onProgress?: (message: string) => void;
}

export async function docxToLessons(
  file: File,
  { splitLevel, courseId, onProgress }: DocxImportOptions,
): Promise<DocxImportResult> {
  const { sections, warnings } = await docxToSections(file, {
    splitLevel,
    entityType: "free-course",
    entityId: courseId,
    noun: "lesson",
    onProgress,
  });

  return { lessons: sections, warnings };
}
