import {
  buildImportGuide,
  importGuideFilename,
} from "@/gradient/components/TiptapEditor/import/importGuideMarkdown";

// The lesson wording of the shared authoring guide. The document rules are
// identical to the project guide's — see importGuideMarkdown.ts.

const NOUNS = {
  noun: "lesson",
  Noun: "Lesson",
  parent: "a course module",
} as const;

export const IMPORT_GUIDE_FILENAME = importGuideFilename(NOUNS);

export const IMPORT_GUIDE_MARKDOWN = buildImportGuide(NOUNS);
