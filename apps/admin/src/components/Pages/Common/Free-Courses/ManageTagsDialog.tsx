"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CourseTag } from "@/types/course";
import {
  getCourseTags,
  createCourseTag,
  updateCourseTag,
  deleteCourseTag,
} from "@/services/courses/courseTags";

export default function ManageTagsDialog() {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<CourseTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchTags = async () => {
    try {
      setLoading(true);
      setTags(await getCourseTags());
    } catch (err) {
      console.error("Failed to load tags", err);
      toast.error("Failed to load tags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchTags();
  }, [open]);

  const handleCreate = async () => {
    const name = newTag.trim();
    if (!name) return;
    try {
      setCreating(true);
      const tag = await createCourseTag(name);
      setTags((prev) =>
        [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewTag("");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create tag");
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    try {
      setBusyId(id);
      const updated = await updateCourseTag(id, name);
      setTags((prev) =>
        prev
          .map((t) => (t.id === id ? updated : t))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
      setEditingName("");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to rename tag");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setBusyId(id);
      await deleteCourseTag(id);
      setTags((prev) => prev.filter((t) => t.id !== id));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to delete tag");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Tags className="h-4 w-4" />
          Manage Tags
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Course Tags</DialogTitle>
          <DialogDescription>
            Tags are shared across all courses and let learners filter on the
            public site. Deleting a tag removes it from every course.
          </DialogDescription>
        </DialogHeader>

        {/* Add new */}
        <div className="flex items-center gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="New tag name…"
            className="h-9 focus-visible:ring-blue-600"
          />
          <Button
            size="sm"
            className="gap-1.5 shrink-0 bg-blue-800 hover:bg-blue-900"
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

        {/* List */}
        <div className="max-h-[50vh] overflow-auto -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : tags.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No tags yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tags.map((tag) => {
                const isEditing = editingId === tag.id;
                const busy = busyId === tag.id;
                return (
                  <li
                    key={tag.id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    {isEditing ? (
                      <Input
                        value={editingName}
                        autoFocus
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleRename(tag.id);
                          } else if (e.key === "Escape") {
                            setEditingId(null);
                          }
                        }}
                        className="h-8 focus-visible:ring-blue-600"
                      />
                    ) : (
                      <span className="text-sm text-gray-800">{tag.name}</span>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600"
                            onClick={() => handleRename(tag.id)}
                            disabled={busy}
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500"
                            onClick={() => setEditingId(null)}
                            disabled={busy}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-blue-600"
                            onClick={() => {
                              setEditingId(tag.id);
                              setEditingName(tag.name);
                            }}
                            disabled={busy}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-red-600"
                            onClick={() => handleDelete(tag.id)}
                            disabled={busy}
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
