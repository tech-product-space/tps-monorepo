"use client";
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, Copy, Link2, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  deleteForm,
  getForms,
  getTeams,
  regenerateFormLink,
  toggleForm,
  publicFormUrl,
  type ExpenseForm,
  type ExpenseTeam,
} from "@/services/expenses/expenseFormsService";
import ExpensesNav from "./ExpensesNav";
import FormEditorDialog from "./FormEditorDialog";

const ExpenseForms = () => {
  const [forms, setForms] = useState<ExpenseForm[]>([]);
  const [teams, setTeams] = useState<ExpenseTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseForm | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const [f, t] = await Promise.all([getForms(), getTeams()]);
      setForms(f);
      setTeams(t);
    } catch {
      toast.error("Failed to load forms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(publicFormUrl(slug));
    toast.success("Link copied");
  };

  const viewForm = (slug: string) => {
    window.open(publicFormUrl(slug), "_blank", "noopener,noreferrer");
  };

  const handleToggle = async (form: ExpenseForm) => {
    try {
      await toggleForm(form.id);
      setForms((prev) =>
        prev.map((f) => (f.id === form.id ? { ...f, is_active: !f.is_active } : f))
      );
    } catch {
      toast.error("Failed to update form");
    }
  };

  const handleRegenerate = async (form: ExpenseForm) => {
    try {
      const updated = await regenerateFormLink(form.id);
      setForms((prev) => prev.map((f) => (f.id === form.id ? { ...f, slug: updated.slug } : f)));
      toast.success("New link generated");
    } catch {
      toast.error("Failed to regenerate link");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteForm(deleteTarget.id);
      toast.success("Form deleted");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete form");
    }
  };

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (f: ExpenseForm) => {
    setEditing(f);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-screen">
      <ExpensesNav
        right={
          <Button onClick={openAdd} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New form
          </Button>
        }
      />

      <div className="flex-1 bg-gray-50 overflow-auto p-5">
        <div className="rounded-lg bg-white shadow">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
            </div>
          ) : forms.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              No forms yet. Create one to share an external expense link.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead className="text-center">Submissions</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>{f.team?.name || "—"}</TableCell>
                    <TableCell className="text-gray-600">{f.allowedCategories?.length || 0}</TableCell>
                    <TableCell className="text-center">{f.submissionCount ?? 0}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => copyLink(f.slug)}
                        title="Copy public link"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        /{f.slug.slice(0, 14)}…
                        <Copy className="h-3 w-3" />
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={f.is_active} onCheckedChange={() => handleToggle(f)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => viewForm(f.slug)}
                          title="Open the public form in a new tab"
                          className="gap-1.5"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRegenerate(f)}
                          title="Generate a new link (invalidates the current one)"
                          className="gap-1.5"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Regenerate link
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(f)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(f)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <FormEditorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        teams={teams}
        form={editing}
        onSaved={load}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The public link will stop working. Submitted expenses are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExpenseForms;
