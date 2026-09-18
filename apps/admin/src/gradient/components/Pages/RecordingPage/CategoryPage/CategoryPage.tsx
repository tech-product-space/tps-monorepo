"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Switch } from "@/gradient/components/ui/switch";

import { recordingService } from "@/gradient/services/recordingService";
import { RecordingCategory } from "@/gradient/types/recording";

export default function CategoryPage() {
  const [categories, setCategories] = useState<RecordingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await recordingService.getCategories();
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

  const handleCreate = async () => {
    if (!newName.trim()) return;

    setCreating(true);
    try {
      await recordingService.createCategory({ name: newName.trim() });
      toast.success("Category added to the end of the chip row");
      setNewName("");
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not create");
    } finally {
      setCreating(false);
    }
  };

  /**
   * Reordering is local until saved, then written as one call with the full
   * ordered list. Per-row `order` writes interleave under two admins and leave
   * gaps — the order of a list is a single fact about the list.
   */
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;

    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      await recordingService.reorderCategories(categories.map((c) => c.id));
      toast.success("Chip order saved");
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not save the order");
      fetchCategories();
    } finally {
      setSavingOrder(false);
    }
  };

  const toggleActive = async (category: RecordingCategory) => {
    try {
      await recordingService.updateCategory(category.id, {
        isActive: !category.isActive,
      });
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not update");
    }
  };

  const handleDelete = (category: RecordingCategory) => {
    const count = category.recordingCount ?? 0;

    toast(`Delete "${category.name}"?`, {
      // The real number, not "are you sure?". Delete is SET NULL: the
      // recordings survive and drop out of every chip, which is a different
      // outcome from losing them and the admin has to be able to tell.
      description: count
        ? `${count} recording${count === 1 ? "" : "s"} will become uncategorised. They stay published and reachable by link, but disappear from the chip filters until you file them again.`
        : "Nothing is filed under it.",
      duration: 10000,
      action: {
        label: "Delete",
        onClick: async () => {
          try {
            const res = await recordingService.deleteCategory(category.id);
            toast.success(
              res.data?.uncategorisedRecordings
                ? `Deleted. ${res.data.uncategorisedRecordings} recording(s) are now uncategorised.`
                : "Category deleted",
            );
            fetchCategories();
          } catch (error: any) {
            toast.error(error.response?.data?.message || "Could not delete");
          }
        },
      },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  };

  return (
    <DashboardLayout title="Recording Categories">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Add a category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Data Analytics Fundamentals"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              The slug is derived from the name and goes in the public URL.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Chip row</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                This is the order they appear in on the recordings page.
              </p>
            </div>
            <Button onClick={saveOrder} disabled={savingOrder || loading}>
              {savingOrder ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save order
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Order</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead className="text-right">Recordings</TableHead>
                    <TableHead>Shown</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : categories.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No categories yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    categories.map((category, index) => (
                      <TableRow key={category.id}>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={index === 0}
                              onClick={() => move(index, -1)}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={index === categories.length - 1}
                              onClick={() => move(index, 1)}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {category.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {category.slug}
                        </TableCell>
                        <TableCell className="text-right">
                          {category.recordingCount ?? 0}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={category.isActive}
                              onCheckedChange={() => toggleActive(category)}
                            />
                            {!category.isActive && (
                              <span className="text-xs text-muted-foreground">
                                hidden from the chip row
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(category)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Switching a category off removes its chip from the page. The
              recordings filed under it stay published and reachable by link.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
