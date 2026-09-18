"use client";

import { Label } from "@/components/ui/label";
import SimpleEditor from "@/components/Pages/Common/SimpleEditor/SimpleEditor";

import { CONTENT_BLOCKS } from "@/utils/recording";
import { RecordingContent } from "@/types/recording";

interface Props {
  value: RecordingContent;
  onChange: (next: RecordingContent) => void;
}

/**
 * A block may arrive as something other than a string if it was ever written by
 * a different shape of form. Coerced rather than trusted, because handing an
 * array to an editor that expects a string blanks the field on the next save.
 */
const asHtml = (raw: unknown): string => {
  if (typeof raw === "string") return raw;

  if (Array.isArray(raw)) {
    const items = raw
      .map((item: any) => {
        const title = item?.title ? `<strong>${item.title}</strong>` : "";
        const description = item?.description ?? "";
        return title || description
          ? `<li>${title}${title && description ? "<br>" : ""}${description}</li>`
          : "";
      })
      .filter(Boolean)
      .join("");

    return items ? `<ul>${items}</ul>` : "";
  }

  return "";
};

/**
 * Renders itself from `CONTENT_BLOCKS`, not from hand-written cards.
 *
 * That is the whole reason `content` is one JSONB column: adding
 * "Prerequisites" later should be one entry in the constant (and its twin on the
 * backend) with no migration and nothing new here.
 */
export default function ContentSection({ value, onChange }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-base font-semibold text-gray-900">
        Page content
      </h2>

      <div className="space-y-8">
        {CONTENT_BLOCKS.map((block) => (
          <div key={block.key} className="space-y-2">
            <Label>{block.label}</Label>
            {block.help && (
              <p className="text-xs text-gray-500">{block.help}</p>
            )}
            <SimpleEditor
              content={asHtml(value?.[block.key])}
              placeholder={block.placeholder}
              onChange={(html) => onChange({ ...value, [block.key]: html })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
