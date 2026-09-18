"use client";
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  archiveCategory,
  archiveSubcategory,
  createCategory,
  createSubcategory,
  getCategories,
  type ExpenseCategory,
} from "@/services/expenses/expensesService";
import ExpensesNav from "./ExpensesNav";

const ExpenseCategories = () => {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategory, setNewCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [subInputs, setSubInputs] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<
    | { kind: "category"; id: string; name: string }
    | { kind: "subcategory"; id: string; name: string }
    | null
  >(null);

  const load = async () => {
    try {
      setLoading(true);
      setCategories(await getCategories());
    } catch {
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreateCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      setCreating(true);
      await createCategory({ name: newCategory.trim() });
      setNewCategory("");
      toast.success("Category added");
      load();
    } catch {
      toast.error("Failed to add category");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateSub = async (categoryId: string) => {
    const name = (subInputs[categoryId] || "").trim();
    if (!name) return;
    try {
      await createSubcategory(categoryId, name);
      setSubInputs((p) => ({ ...p, [categoryId]: "" }));
      toast.success("Subcategory added");
      load();
    } catch {
      toast.error("Failed to add subcategory");
    }
  };

  const handleArchive = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === "category") await archiveCategory(confirm.id);
      else await archiveSubcategory(confirm.id);
      toast.success("Archived");
      setConfirm(null);
      load();
    } catch {
      toast.error("Failed to archive");
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <ExpensesNav />

      <div className="flex-1 bg-gray-50 overflow-auto p-5">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* New category */}
          <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
            <Input
              placeholder="New category name"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
            />
            <Button onClick={handleCreateCategory} disabled={creating} className="flex items-center gap-2 shrink-0">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add category
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center text-gray-500 py-16">No categories yet.</div>
          ) : (
            <div className="space-y-3">
              {categories.map((c) => {
                const open = expanded[c.id];
                return (
                  <div key={c.id} className="bg-white rounded-lg shadow">
                    <div className="flex items-center justify-between px-4 py-3">
                      <button
                        className="flex items-center gap-2 font-medium"
                        onClick={() => setExpanded((p) => ({ ...p, [c.id]: !open }))}
                      >
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {c.name}
                        <span className="text-xs text-gray-400">
                          ({c.subcategories?.length || 0})
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setConfirm({ kind: "category", id: c.id, name: c.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {open && (
                      <div className="border-t px-4 py-3 space-y-2">
                        {c.subcategories?.map((s) => (
                          <div key={s.id} className="flex items-center justify-between pl-6 text-sm">
                            <span>{s.name}</span>
                            <button
                              className="text-gray-400 hover:text-red-600"
                              onClick={() => setConfirm({ kind: "subcategory", id: s.id, name: s.name })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pl-6 pt-1">
                          <Input
                            placeholder="New subcategory"
                            value={subInputs[c.id] || ""}
                            onChange={(e) => setSubInputs((p) => ({ ...p, [c.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && handleCreateSub(c.id)}
                            className="h-8"
                          />
                          <Button size="sm" variant="outline" onClick={() => handleCreateSub(c.id)}>
                            Add
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be hidden from pickers. Existing expenses keep their {confirm?.kind} label.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} className="bg-red-600 hover:bg-red-700">
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExpenseCategories;
