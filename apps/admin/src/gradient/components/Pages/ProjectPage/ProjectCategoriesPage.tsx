"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Switch } from "@/gradient/components/ui/switch";
import { Textarea } from "@/gradient/components/ui/textarea";
import ThumbnailUploader from "@/gradient/components/Common/ThumbnailUploader";

import { resolveStorageUrl } from "@/gradient/lib/storage";
import { projectService } from "@/gradient/services/projectService";
import { ProjectCategory } from "@/gradient/types/project";

export default function ProjectCategoriesPage() {
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectCategory | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await projectService.getCategories();
      if (data.success) setCategories(data.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setThumbnail("");
    setDialogOpen(true);
  };

  const openEdit = (category: ProjectCategory) => {
    setEditing(category);
    setName(category.name);
    setDescription(category.description ?? "");
    setThumbnail(category.thumbnail ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      const data = editing
        ? await projectService.updateCategory(editing.id, {
            name: name.trim(),
            description: description.trim(),
            // Sent even when empty, so clearing the tile art actually clears it.
            thumbnail,
          })
        : await projectService.createCategory({
            name: name.trim(),
            description: description.trim() || undefined,
            thumbnail: thumbnail || undefined,
          });

      if (data.success) {
        toast.success(editing ? "Category updated" : "Category created");
        setDialogOpen(false);
        fetchCategories();
      } else {
        toast.error(data.message || "Could not save the category");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (category: ProjectCategory) => {
    try {
      const data = await projectService.updateCategory(category.id, {
        isActive: !category.isActive,
      });
      if (data.success) fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not update");
    }
  };

  /** Optimistic locally, then persisted — see GuideEditor for the reasoning. */
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;

    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);

    setSavingOrder(true);
    try {
      await projectService.reorderCategories(next.map((c) => c.id));
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not save the order");
      fetchCategories();
    } finally {
      setSavingOrder(false);
    }
  };

  /**
   * Deleting is `SET NULL`, not a cascade — the projects survive and become
   * uncategorised. The confirm has to say how many, because "are you sure"
   * does not tell an admin what they are about to do to 12 live projects.
   */
  const handleDelete = async (category: ProjectCategory) => {
    const count = category.projectCount ?? 0;

    const message = count
      ? `Delete "${category.name}"? ${count} project${count === 1 ? "" : "s"} will become uncategorised — they stay live but drop off the category grid.`
      : `Delete "${category.name}"?`;

    if (!window.confirm(message)) return;

    try {
      const data = await projectService.deleteCategory(category.id);
      if (data.success) {
        const orphaned = data.data?.uncategorisedProjects ?? 0;
        toast.success(
          orphaned
            ? `Category deleted — ${orphaned} project${orphaned === 1 ? "" : "s"} now uncategorised`
            : "Category deleted",
        );
        fetchCategories();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not delete");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Categories</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              The tile grid on /projects. The order here is the order they
              appear in.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add category
          </Button>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center">
              <p className="font-medium">No categories yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A project cannot be created until one exists.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {categories.map((category, index) => (
                <li
                  key={category.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <span className="w-6 text-center text-sm text-muted-foreground">
                    {index + 1}
                  </span>

                  {/* The tile as the site will draw it. A category with no
                      artwork renders as an empty black box on the hub, so the
                      gap has to be visible from the list rather than only from
                      inside the dialog. */}
                  {category.thumbnail ? (
                    <img
                      src={resolveStorageUrl(category.thumbnail)}
                      alt=""
                      className="h-11 w-19.5 shrink-0 rounded-md border object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-19.5 shrink-0 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                      No tile
                    </span>
                  )}

                  <button
                    onClick={() => openEdit(category)}
                    className="flex-1 text-left"
                  >
                    <span className="font-medium hover:underline">
                      {category.name}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      /{category.slug}
                    </span>
                  </button>

                  <span className="text-sm text-muted-foreground">
                    {category.projectCount ?? 0} project
                    {category.projectCount === 1 ? "" : "s"}
                  </span>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={category.isActive}
                      onCheckedChange={() => handleToggleActive(category)}
                      aria-label="Show on the site"
                    />
                    <span className="w-14 text-xs text-muted-foreground">
                      {category.isActive ? "Visible" : "Hidden"}
                    </span>
                  </div>

                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === 0 || savingOrder}
                      onClick={() => move(index, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === categories.length - 1 || savingOrder}
                      onClick={() => move(index, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(category)}
                      aria-label="Delete category"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit category" : "New category"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Machine Learning"
                autoFocus
              />
              {editing && (
                <p className="text-xs text-muted-foreground">
                  URL stays /{editing.slug} — renaming does not move the page.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tile image</Label>
              <ThumbnailUploader
                value={thumbnail}
                onChange={setThumbnail}
                entityType="project"
                hint="This is the whole tile on /projects — the name, the word “Projects” and the arrow all need to be part of the artwork."
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Free python projects you can complete on your own and flaunt in your dev portfolio"
              />
              <p className="text-xs text-muted-foreground">
                The sub-heading on this category&apos;s page.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
