"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Label } from "@/gradient/components/ui/label";
import RichTextEditor from "@/gradient/components/ui/RichTextEditor/RichTextEditor";

import { CONTENT_BLOCKS } from "@/gradient/constants/recording";
import { RecordingContent } from "@/gradient/types/recording";

interface Props {
  value: RecordingContent;
  onChange: (next: RecordingContent) => void;
}

/**
 * Legacy shape guard.
 *
 * `whatYouWillLearn` used to be `[{ title, description }]` before both blocks
 * became rich text. A migration converted the stored rows, but a row that
 * slipped through — or an older draft held in a browser tab — would otherwise
 * hand an array to an editor that expects a string and blank the field on the
 * next save.
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
 * "Prerequisites" later should be one entry in the constant (and its twin on
 * the backend) with no migration and nothing new here.
 */
export default function ContentSection({ value, onChange }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Page content</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {CONTENT_BLOCKS.map((block) => (
          <div key={block.key} className="space-y-2">
            <Label>{block.label}</Label>
            {block.help && (
              <p className="text-xs text-muted-foreground">{block.help}</p>
            )}
            <RichTextEditor
              value={asHtml(value[block.key])}
              placeholder={block.placeholder}
              onChange={(html) => onChange({ ...value, [block.key]: html })}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
