"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useNotification } from "@/helpers/NotificationContext";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import {
  createRecordingCategory,
  deleteRecordingCategory,
  getRecordingCategories,
  reorderRecordingCategories,
  updateRecordingCategory,
} from "@/services/recordings/recordingsService";
import { slugifyRecording } from "@/utils/recording";
import { RecordingCategory } from "@/types/recording";

/**
 * The chip row on the public listing page, in the order it renders.
 *
 * Two things here are not obvious from the screen:
 *
 * - **Retiring is not deleting.** A retired chip leaves the row; its recordings
 *   stay published and reachable by link and by "keep exploring".
 * - **Deleting a chip uncategorises its recordings**, because the FK is
 *   ON DELETE SET NULL. The dialog names the number, which is why the list
 *   endpoint returns `recordingCount` — "are you sure?" is not enough
 *   information to answer with.
 */
export default function RecordingCategoriesPage() {
  const router = useRouter();
  const basePath = useAutomationBasePath();
  const { showNotification } = useNotification();

  const [categories, setCategories] = useState<RecordingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<RecordingCategory | null>(null);
  const [editName, setEditName] = useState("");

  const [pendingDelete, setPendingDelete] = useState<RecordingCategory | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getRecordingCategories();
      setCategories(response.data ?? []);
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not load categories"
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugifyRecording(name));
  }, [name, slugTouched]);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setCreating(true);
    try {
      await createRecordingCategory({ name: name.trim(), slug });
      showNotification("success", "Category added");
      setAddOpen(false);
      setName("");
      setSlug("");
      setSlugTouched(false);
      load();
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not add the category"
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!editing || !editName.trim()) return;

    try {
      // The slug is deliberately not renamed with the name: it is in URLs people
      // have already shared, and a label is not a location.
      await updateRecordingCategory(editing.id, { name: editName.trim() });
      showNotification("success", "Category renamed");
      setEditing(null);
      load();
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not rename the category"
      );
    }
  };

  const handleToggleActive = async (category: RecordingCategory) => {
    try {
      await updateRecordingCategory(category.id, {
        isActive: !category.isActive,
      });
      load();
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not update the category"
      );
    }
  };

  /** One write for the whole order — see the backend controller for why. */
  const move = async (index: number, direction: -1 | 1) => {
    const next = [...categories];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;

    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);

    setSavingOrder(true);
    try {
      await reorderRecordingCategories(next.map((c) => c.id));
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not save the new order"
      );
      load();
    } finally {
      setSavingOrder(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;

    try {
      await deleteRecordingCategory(pendingDelete.id);
      showNotification("success", "Category deleted");
      setPendingDelete(null);
      load();
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not delete the category"
      );
    }
  };

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`${basePath}/recordings`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-lg font-semibold text-gray-900">
            Recording categories
          </p>
        </div>

        <div className="flex items-center gap-3">
          {savingOrder && (
            <span className="text-xs text-gray-500">Saving order…</span>
          )}
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add category
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 p-5">
        <p className="mb-4 max-w-2xl text-sm text-gray-600">
          These are the chips above the recordings grid, in this order. Hiding a
          category removes its chip; the recordings filed under it stay published
          and reachable.
        </p>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Order</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Recordings</TableHead>
                  <TableHead>Shown</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category, index) => (
                  <TableRow key={category.id}>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={index === categories.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>

                    <TableCell>
                      <button
                        className="font-medium text-gray-900 hover:underline"
                        onClick={() => {
                          setEditing(category);
                          setEditName(category.name);
                        }}
                      >
                        {category.name}
                      </button>
                    </TableCell>

                    <TableCell className="text-xs text-gray-500">
                      ?category={category.slug}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline">
                        {category.recordingCount ?? 0}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Switch
                        checked={category.isActive}
                        onCheckedChange={() => handleToggleActive(category)}
                      />
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDelete(category)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Add */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product Analytics"
              />
            </div>
            <div className="space-y-2">
              <Label>URL slug</Label>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugifyRecording(e.target.value));
                }}
              />
              <p className="text-xs text-gray-500">
                Appears in the URL as ?category={slug || "…"}. Hard to change
                later — people bookmark it.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                The URL stays <code>?category={editing?.slug}</code> — a label is
                not a location, and links already shared keep working.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={handleRename}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{pendingDelete?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.recordingCount
                ? `${pendingDelete.recordingCount} recording${
                    pendingDelete.recordingCount === 1 ? "" : "s"
                  } will become uncategorised. They stay published and reachable by link, but disappear from the chip filters.`
                : "Nothing is filed under this category."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
