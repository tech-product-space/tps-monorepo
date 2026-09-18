import {
  docxToSections,
  type DocxSection,
  type SplitLevel,
} from "@/gradient/components/TiptapEditor/import/docxToSections";

// Guide steps, in terms of the shared .docx splitter. The free-course lesson
// importer is the same call with a different noun and S3 entity.

export type { SplitLevel };

export type DocxStep = DocxSection;

export interface StepImportResult {
  steps: DocxStep[];
  warnings: string[];
}

export interface StepImportOptions {
  splitLevel: SplitLevel;
  /** The S3 entity id for any images pulled out of the document. */
  projectId: string;
  onProgress?: (message: string) => void;
}

export async function docxToSteps(
  file: File,
  { splitLevel, projectId, onProgress }: StepImportOptions,
): Promise<StepImportResult> {
  const { sections, warnings } = await docxToSections(file, {
    splitLevel,
    entityType: "project",
    entityId: projectId,
    noun: "step",
    onProgress,
  });

  return { steps: sections, warnings };
}
