import {
  buildImportGuide,
  importGuideFilename,
} from "@/gradient/components/TiptapEditor/import/importGuideMarkdown";

// The guide-step wording of the shared authoring guide.

const NOUNS = {
  noun: "step",
  Noun: "Step",
  parent: "a project guide",
} as const;

export const STEP_IMPORT_GUIDE_FILENAME = importGuideFilename(NOUNS);

export const STEP_IMPORT_GUIDE_MARKDOWN = buildImportGuide(NOUNS);
