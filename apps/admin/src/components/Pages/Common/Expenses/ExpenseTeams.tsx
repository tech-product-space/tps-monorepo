"use client";
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Check, X, Pencil } from "lucide-react";
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
  archiveTeam,
  createTeam,
  getTeams,
  updateTeam,
  type ExpenseTeam,
} from "@/services/expenses/expenseFormsService";
import ExpensesNav from "./ExpensesNav";

const ExpenseTeams = () => {
  const [teams, setTeams] = useState<ExpenseTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTeam, setNewTeam] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirm, setConfirm] = useState<ExpenseTeam | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setTeams(await getTeams());
    } catch {
      toast.error("Failed to load teams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!newTeam.trim()) return;
    try {
      setCreating(true);
      await createTeam(newTeam.trim());
      setNewTeam("");
      toast.success("Team added");
      load();
    } catch {
      toast.error("Failed to add team");
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await updateTeam(id, { name: editingName.trim() });
      setEditingId(null);
      toast.success("Team renamed");
      load();
    } catch {
      toast.error("Failed to rename team");
    }
  };

  const handleArchive = async () => {
    if (!confirm) return;
    try {
      await archiveTeam(confirm.id);
      toast.success("Team archived");
      setConfirm(null);
      load();
    } catch {
      toast.error("Failed to archive team");
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <ExpensesNav />

      <div className="flex-1 bg-gray-50 overflow-auto p-5">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
            <Input
              placeholder="New team name (e.g. Sales, HR, Tech)"
              value={newTeam}
              onChange={(e) => setNewTeam(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={creating} className="flex items-center gap-2 shrink-0">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add team
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center text-gray-500 py-16">No teams yet.</div>
          ) : (
            <div className="bg-white rounded-lg shadow divide-y">
              {teams.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  {editingId === t.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename(t.id)}
                        className="h-8 max-w-xs"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="text-green-600" onClick={() => handleRename(t.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-gray-400" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium">{t.name}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(t.id);
                            setEditingName(t.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => setConfirm(t)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be hidden from pickers. Existing forms and expenses keep their team label.
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

export default ExpenseTeams;
