import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

interface LessonSEO {
  title?: string;
  description?: string;
  keywords?: string[];
}

interface Props {
  seoMeta?: LessonSEO;
  onChange: (seo: LessonSEO) => void;
}

export function LessonSEOForm({ seoMeta, onChange }: Props) {
  const [newKeyword, setNewKeyword] = useState("");

  const addKeyword = () => {
    const kw = newKeyword.trim();
    if (!kw) return;

    const current = seoMeta?.keywords || [];
    if (current.includes(kw)) return;

    onChange({
      ...seoMeta,
      keywords: [...current, kw],
    });

    setNewKeyword("");
  };

  const removeKeyword = (index: number) => {
    const current = seoMeta?.keywords || [];
    onChange({
      ...seoMeta,
      keywords: current.filter((_, i) => i !== index),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>SEO Meta Data</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* SEO Title */}
        <div className="space-y-1.5">
          <Label>SEO Title</Label>
          <Input
            value={seoMeta?.title || ""}
            onChange={(e) =>
              onChange({
                ...seoMeta,
                title: e.target.value,
              })
            }
          />
        </div>

        {/* SEO Description */}
        <div className="space-y-1.5">
          <Label>SEO Description</Label>
          <Textarea
            rows={4}
            value={seoMeta?.description || ""}
            onChange={(e) =>
              onChange({
                ...seoMeta,
                description: e.target.value,
              })
            }
            className="resize-none"
          />
        </div>

        {/* Keywords */}
        <div className="space-y-3">
          <Label>Meta Keywords</Label>

          <div className="flex gap-2">
            <Input
              placeholder="Add keyword..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addKeyword()}
            />
            <Button size="icon" variant="outline" onClick={addKeyword}>
              <Plus size={16} />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(seoMeta?.keywords || []).map((kw, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {kw}
                <button onClick={() => removeKeyword(i)}>
                  <X size={12} />
                </button>
              </Badge>
            ))}

            {(!seoMeta?.keywords || seoMeta.keywords.length === 0) && (
              <p className="text-xs text-gray-400 italic">No keywords added</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
