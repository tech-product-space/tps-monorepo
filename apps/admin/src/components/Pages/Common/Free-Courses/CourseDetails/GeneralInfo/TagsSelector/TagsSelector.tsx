"use client";

import React, { useEffect, useState } from "react";
import { Course, CourseTag } from "@/types/course";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Check, Tag as TagIcon } from "lucide-react";
import { getCourseTags, createCourseTag } from "@/services/courses/courseTags";
import { toast } from "sonner";

interface TagsSelectorProps {
  form: Partial<Course>;
  setForm: React.Dispatch<React.SetStateAction<Partial<Course>>>;
}

export const TagsSelector: React.FC<TagsSelectorProps> = ({ form, setForm }) => {
  const [allTags, setAllTags] = useState<CourseTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = form.tags ?? [];
  const selectedIds = new Set(selected.map((t) => t.id));

  const fetchTags = async () => {
    try {
      setLoading(true);
      const tags = await getCourseTags();
      setAllTags(tags);
    } catch (err) {
      console.error("Failed to load course tags", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const toggle = (tag: CourseTag) => {
    setForm((prev) => {
      const current = prev.tags ?? [];
      const exists = current.some((t) => t.id === tag.id);
      return {
        ...prev,
        tags: exists
          ? current.filter((t) => t.id !== tag.id)
          : [...current, tag],
      };
    });
  };

  const handleCreate = async () => {
    const name = newTag.trim();
    if (!name) return;

    // Reuse an existing tag (case-insensitive) instead of erroring.
    const existing = allTags.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      if (!selectedIds.has(existing.id)) toggle(existing);
      setNewTag("");
      return;
    }

    try {
      setCreating(true);
      const tag = await createCourseTag(name);
      setAllTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      toggle(tag);
      setNewTag("");
    } catch (err: any) {
      console.error("Failed to create tag", err);
      toast.error(err?.response?.data?.message || "Failed to create tag");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="border-gray-200">
      <CardHeader className="border-b border-gray-100 pb-2!">
        <CardTitle className="text-lg font-semibold">Tags</CardTitle>
      </CardHeader>

      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground mb-4">
          Tags let learners filter courses on the public site. Pick from the
          global list or add a new one.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tags…
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allTags.length === 0 && (
              <span className="text-sm text-gray-400">
                No tags yet — create one below.
              </span>
            )}
            {allTags.map((tag) => {
              const active = selectedIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggle(tag)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors ${
                    active
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {active ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <TagIcon className="h-3.5 w-3.5" />
                  )}
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Inline add */}
        <div className="mt-5 flex items-center gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="Add a new tag…"
            className="focus-visible:ring-blue-600 h-9"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={handleCreate}
            disabled={creating || !newTag.trim()}
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
