"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  getAllRecordings,
  getRecordingCategories,
} from "@/services/recordings/recordingsService";
import { formatDuration } from "@/utils/recording";
import { RecordingCategory, RecordingResponse } from "@/types/recording";

interface Props {
  /** `{ recordingFilters: { [id]: {} }, categoryIds: string[] }` */
  selectedRecordingIds: string[];
  categoryIds: string[];
  onToggleRecording: (id: string) => void;
  onCategoriesChange: (ids: string[]) => void;
}

/**
 * Who gets the campaign: everybody who passed the gate on these recordings.
 *
 * **Two modes, not one combined filter.** Picking recordings and picking
 * categories are different questions — "the three SQL sessions we ran in March"
 * and "anybody who has ever watched an SQL session" — and the resolver treats
 * both lists as narrowing when they arrive together. Offering them as one screen
 * with both sets of checkboxes live would let somebody build an intersection
 * they did not mean and cannot see. The mode makes the choice explicit and sends
 * exactly one of the two.
 *
 * A category is also the segment that keeps working: a recording published next
 * week joins it on its own, where a hand-picked list silently goes stale.
 */
export default function RecordingLeadsStep({
  selectedRecordingIds,
  categoryIds,
  onToggleRecording,
  onCategoriesChange,
}: Props) {
  const [recordings, setRecordings] = useState<RecordingResponse[]>([]);
  const [categories, setCategories] = useState<RecordingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const mode: "recordings" | "categories" = categoryIds.length
    ? "categories"
    : "recordings";

  useEffect(() => {
    const load = async () => {
      try {
        const [recordingsRes, categoriesRes] = await Promise.all([
          getAllRecordings({ limit: 50, sort: "recent" }),
          getRecordingCategories(),
        ]);
        setRecordings(recordingsRes.data ?? []);
        setCategories(categoriesRes.data ?? []);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return recordings;

    return recordings.filter((recording) =>
      recording.title.toLowerCase().includes(needle)
    );
  }, [recordings, q]);

  const setMode = (next: "recordings" | "categories") => {
    // Switching modes clears the other list, because sending both narrows the
    // audience to their intersection — which is never what somebody means by
    // "actually, by category".
    if (next === "categories") {
      selectedRecordingIds.forEach(onToggleRecording);
    } else {
      onCategoriesChange([]);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("recordings")}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            mode === "recordings"
              ? "border-primary bg-primary/10 text-primary"
              : "border-muted-foreground/30 text-muted-foreground"
          }`}
        >
          Pick recordings
        </button>
        <button
          type="button"
          onClick={() => setMode("categories")}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            mode === "categories"
              ? "border-primary bg-primary/10 text-primary"
              : "border-muted-foreground/30 text-muted-foreground"
          }`}
        >
          Whole categories
        </button>
      </div>

      {mode === "categories" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Everybody who passed the gate on any recording in these categories —
            including recordings published after this campaign is set up.
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => {
              const checked = categoryIds.includes(category.id);
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() =>
                    onCategoriesChange(
                      checked
                        ? categoryIds.filter((id) => id !== category.id)
                        : [...categoryIds, category.id]
                    )
                  }
                  className={`rounded-full border px-3 py-1 text-sm ${
                    checked
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted-foreground/30"
                  }`}
                >
                  {category.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {category.recordingCount ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          {categoryIds.length === 0 && (
            <p className="text-xs text-amber-600">
              Nothing selected — this source will resolve to nobody.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search recordings"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-md border p-2">
            {visible.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No recordings match that search.
              </p>
            ) : (
              visible.map((recording) => (
                <label
                  key={recording.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedRecordingIds.includes(recording.id)}
                    onCheckedChange={() => onToggleRecording(recording.id)}
                  />
                  <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {recording.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {recording.category?.name ?? "Uncategorised"} ·{" "}
                      {formatDuration(recording.durationMinutes)}
                      {!recording.isPublished && " · draft"}
                    </div>
                  </div>
                  {/* People, not gate passes — this is a recipient count. */}
                  <Badge variant="outline">
                    {recording.leadCount ?? 0} leads
                  </Badge>
                </label>
              ))
            )}
          </div>

          <Label className="text-xs text-muted-foreground">
            {selectedRecordingIds.length} recording
            {selectedRecordingIds.length === 1 ? "" : "s"} selected
          </Label>
        </div>
      )}
    </div>
  );
}
