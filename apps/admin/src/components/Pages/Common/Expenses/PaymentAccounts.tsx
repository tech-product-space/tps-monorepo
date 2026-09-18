"use client";
import { useEffect, useState } from "react";
import axios from "axios";
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
  archivePaymentAccount,
  createPaymentAccount,
  getPaymentAccounts,
  updatePaymentAccount,
  type ExpensePaymentAccount,
} from "@/services/expenses/expensesService";
import ExpensesNav from "./ExpensesNav";

const errorMessage = (err: unknown, fallback: string) =>
  axios.isAxiosError(err) ? err.response?.data?.error || fallback : fallback;

const PaymentAccounts = () => {
  const [accounts, setAccounts] = useState<ExpensePaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAccount, setNewAccount] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirm, setConfirm] = useState<ExpensePaymentAccount | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setAccounts(await getPaymentAccounts());
    } catch {
      toast.error("Failed to load payment accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!newAccount.trim()) return;
    try {
      setCreating(true);
      await createPaymentAccount(newAccount.trim());
      setNewAccount("");
      toast.success("Payment account added");
      load();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to add payment account"));
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await updatePaymentAccount(id, { name: editingName.trim() });
      setEditingId(null);
      toast.success("Payment account renamed");
      load();
    } catch (err) {
      // 409 when the new name collides with another account.
      toast.error(errorMessage(err, "Failed to rename payment account"));
    }
  };

  const handleArchive = async () => {
    if (!confirm) return;
    try {
      await archivePaymentAccount(confirm.id);
      toast.success("Payment account archived");
      setConfirm(null);
      load();
    } catch {
      toast.error("Failed to archive payment account");
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <ExpensesNav />

      <div className="flex-1 bg-gray-50 overflow-auto p-5">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="bg-white rounded-lg shadow p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Input
                placeholder="New account name (e.g. HDFC Current A/C, Petty Cash)"
                value={newAccount}
                onChange={(e) => setNewAccount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 shrink-0"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add account
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              The account an expense was paid from. Used in the expense form, the recurring
              templates, the CSV import and the list filter.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center text-gray-500 py-16">No payment accounts yet.</div>
          ) : (
            <div className="bg-white rounded-lg shadow divide-y">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3">
                  {editingId === a.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename(a.id)}
                        className="h-8 max-w-xs"
                        autoFocus
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-green-600"
                        onClick={() => handleRename(a.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-gray-400"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium">{a.name}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(a.id);
                            setEditingName(a.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => setConfirm(a)}
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
              It will be hidden from pickers, filters and CSV imports. Existing expenses keep their
              account label.
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

export default PaymentAccounts;
