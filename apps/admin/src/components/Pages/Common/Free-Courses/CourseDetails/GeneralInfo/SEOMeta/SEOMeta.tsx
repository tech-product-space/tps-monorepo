"use client";

import React from "react";
import { Course } from "@/types/course";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";

interface SEOMetaProps {
  form: Partial<Course>;
  setForm: React.Dispatch<React.SetStateAction<Partial<Course>>>;
  newKeyword: string;
  setNewKeyword: (val: string) => void;
}

export const SEOMeta: React.FC<SEOMetaProps> = ({
  form,
  setForm,
  newKeyword,
  setNewKeyword,
}) => {
  const addKeyword = () => {
    const kw = newKeyword.trim();
    const currentKeywords = form.seo_meta?.keywords || [];
    if (kw && !currentKeywords.includes(kw)) {
      setForm((prev) => ({
        ...prev,
        seo_meta: {
          ...(prev.seo_meta || {}),
          keywords: [...currentKeywords, kw],
        },
      }));
      setNewKeyword("");
    }
  };

  const removeKeyword = (index: number) => {
    setForm((prev) => ({
      ...prev,
      seo_meta: {
        ...(prev.seo_meta || {}),
        keywords: (prev.seo_meta?.keywords || []).filter((_, i) => i !== index),
      },
    }));
  };
  return (
    <Card className="border-gray-200 min-h-[70vh]">
      <CardHeader className="pb-3 border-b border-gray-100">
        <CardTitle className="text-lg font-semibold">SEO Meta Data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold tracking-wider">
            SEO Title
          </Label>
          <Input
            value={form.seo_meta?.title || ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                seo_meta: {
                  ...(prev.seo_meta || {}),
                  title: e.target.value,
                },
              }))
            }
            className="focus-visible:ring-blue-600"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold tracking-wider">
            SEO Description
          </Label>
          <Textarea
            rows={4}
            value={form.seo_meta?.description || ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                seo_meta: {
                  ...(prev.seo_meta || {}),
                  description: e.target.value,
                },
              }))
            }
            className="focus-visible:ring-blue-600 resize-none text-sm"
          />
        </div>
        <div className="space-y-3">
          <Label className="text-[13px] font-semibold tracking-wider">
            Meta Keywords
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="Add keyword..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addKeyword()}
              className="focus-visible:ring-blue-600 text-sm"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={addKeyword}
              className="shrink-0 h-10 w-10"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.seo_meta?.keywords?.map((kw, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="gap-1.5 py-1 px-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 border-none transition-colors group"
              >
                {kw}
                <button
                  type="button"
                  className="focus:outline-none"
                  onClick={() => removeKeyword(i)}
                >
                  <X
                    size={14}
                    className="text-gray-400 group-hover:text-red-500 hover:cursor-pointer transition-colors"
                  />
                </button>
              </Badge>
            ))}
            {(!form.seo_meta?.keywords ||
              form.seo_meta.keywords.length === 0) && (
              <p className="text-[13px] text-gray-400 italic">
                No keywords added
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
